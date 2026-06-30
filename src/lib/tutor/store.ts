// server-only: this module opens DB connections and must never be imported into
// a Client Component. (the `server-only` package isn't installed; this comment
// is the guard, and only server actions / route handlers import it.)
import { and, count, desc, eq, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attempt, deletionAudit, enrollment, learner, skillState, user, verification } from "@/lib/db/schema";
import type { ActivityScore, SkillOutcome, SkillTag } from "@/content";
import { deriveOutcome, type DayKey, type SkillRecord, type SkillState } from "./mastery";
import {
  enrollmentConfigSchema,
  learnerSettingsSchema,
  type EnrollmentConfig,
  type LearnerSettings,
} from "@/lib/content/config";
import { getPublishedVersionId } from "@/lib/content/store";
import { canTransitionStatus, type EnrollmentDetail, type EnrollmentStatus } from "./enrollment";
import { shapeLearnerExport, type LearnerExport } from "./export";
import { shapeAccountExport, type AccountExport } from "./account-export";
import { parseJsonbFailClosed } from "./jsonb";
import { toLearnerRow, withOwnedLearner, type LearnerRow } from "./scope";

// getLearner + LearnerRow now live in ./scope (the shared account-ownership gate);
// re-export them so existing importers of "@/lib/tutor/store" keep their paths.
export { getLearner } from "./scope";
export type { LearnerRow };

/**
 * The DB-backed tutor store: the server equivalent of the client's
 * useSkillState. Every read/write is scoped to an account (the Better Auth
 * user), so one parent can only ever touch their own learners' data (spec §7).
 * The mastery engine (deriveOutcome) is applied here so client and server agree
 * on what "solid" means.
 */

/** Bound stored evidence (jsonb can otherwise grow without limit). */
const MAX_HISTORY = 24;

/** Pure: fold one attempt's evidence for a skill into its prior history and
 *  re-derive the outcome. Extracted so the gate logic is unit-testable. */
export function nextSkillRecord(
  prior: { day: string; outcome: string }[] | undefined,
  outcome: SkillOutcome,
  day: DayKey,
): { history: { day: string; outcome: SkillOutcome }[]; outcome: SkillOutcome } {
  const history = [...(prior ?? []), { day, outcome }].slice(-MAX_HISTORY) as {
    day: string;
    outcome: SkillOutcome;
  }[];
  return { history, outcome: deriveOutcome({ history } as SkillRecord) };
}

export async function listLearners(accountId: string): Promise<LearnerRow[]> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(eq(learner.accountId, accountId))
    .orderBy(learner.createdAt);
  return rows.map(toLearnerRow);
}

export async function createLearner(
  accountId: string,
  input: { displayName: string; birthMonth?: string; avatar?: string },
): Promise<LearnerRow> {
  const rows = await getDb()
    .insert(learner)
    .values({
      accountId,
      displayName: input.displayName,
      birthMonth: input.birthMonth ?? null,
      avatar: input.avatar ?? null,
    })
    .returning();
  return toLearnerRow(rows[0]);
}

/** The account's first learner, creating a default one if none exist. */
export async function ensureDefaultLearner(
  accountId: string,
  defaults: { displayName: string; birthMonth?: string },
): Promise<LearnerRow> {
  const existing = await listLearners(accountId);
  if (existing.length > 0) return existing[0];
  return createLearner(accountId, defaults);
}

/**
 * Lazily create a (learner, program) enrollment, pinned to the program's CURRENT
 * published version at creation time (Fix-E Layer 3). Resolving
 * `getPublishedVersionId` and storing it as `programVersionId` means a
 * default/self-enroll learner is anchored to the version they started on and does
 * NOT silently follow whatever publishes next — matching parent-assigned
 * enrollments (assignProgram), which already pin. A static builtin with no DB
 * published version resolves to null → null pin → the learner surface serves the
 * static tree (correct). Kept `onConflictDoNothing`: an existing or soft-removed
 * enrollment is never repinned or resurrected (a paused/removed program stays so,
 * and a learner mid-program is never moved to a newer pin). No backfill of
 * pre-existing rows is done (pilot: no durable enrollment data to migrate).
 */
export async function ensureEnrollment(learnerId: string, programSlug: string): Promise<void> {
  const programVersionId = await getPublishedVersionId(programSlug);
  await getDb()
    .insert(enrollment)
    .values({ learnerId, programSlug, programVersionId })
    .onConflictDoNothing({ target: [enrollment.learnerId, enrollment.programSlug] });
}

/** Program slugs a learner is enrolled in (verified to belong to the account). */
export async function listEnrollments(accountId: string, learnerId: string): Promise<string[]> {
  return withOwnedLearner<string[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ programSlug: enrollment.programSlug })
        .from(enrollment)
        .where(eq(enrollment.learnerId, learnerId));
      return rows.map((r) => r.programSlug);
    },
    [],
  );
}

/**
 * Thrown by {@link recordAttempt} when the learner has no ACTIVE enrollment for
 * the program the attempt belongs to (Fix-F A4). The attempt is NOT persisted;
 * the action maps this to `reason: "inactive"`. This is the server-authoritative
 * curation gate: progress can never be written for a removed/paused/unassigned
 * program, even via a direct API call that bypasses the kid-surface render-block.
 */
export class EnrollmentNotActiveError extends Error {
  constructor(learnerId: string, programSlug: string) {
    super(`No active enrollment for learner "${learnerId}" in program "${programSlug}"`);
    this.name = "EnrollmentNotActiveError";
  }
}

/** The (learner, program) composite predicate shared by every single-enrollment
 *  query (keyed on the `enrollment_learner_program_uq` unique index). */
function enrollmentKey(learnerId: string, programSlug: string) {
  return and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, programSlug));
}

export interface RecordAttemptInput {
  learnerId: string;
  /** The program the activity belongs to — the active-enrollment gate keys on it. */
  programSlug: string;
  activityId: string;
  kind: string;
  generated?: boolean;
  response?: unknown;
  score: ActivityScore;
  /** YYYY-MM-DD; defaults to today (caller's clock). */
  day: DayKey;
  /**
   * AI provenance for a generated attempt (P6 / §8). Persisted ONLY when
   * `generated` is true; metadata only (model/route/at), never a raw prompt.
   * Absent for authored attempts → the gen_* columns stay null.
   */
  provenance?: { model: string; route: string; at: Date };
}

/**
 * Record one completed activity and fold its skill evidence into skill_state.
 * Verifies the learner belongs to the account AND has an ACTIVE enrollment for
 * the program (tenancy + curation boundaries), both inside the transaction.
 * @throws when the learner is not owned by the account (tenancy).
 * @throws {EnrollmentNotActiveError} when no ACTIVE enrollment exists for the
 *   (learner, programSlug) pair — nothing is persisted (server-authoritative
 *   curation gate, Fix-F A4).
 */
export async function recordAttempt(accountId: string, input: RecordAttemptInput): Promise<void> {
  // The attempt row and every per-skill fold must commit together: a partial
  // write (attempt saved, skill_state not) loses mastery evidence, and two
  // concurrent submits racing the read-modify-write would otherwise either
  // throw a unique violation after the attempt row is already in, or drop one
  // submit's evidence (last-writer-wins). One transaction + a row lock per
  // (learner,skill) makes the whole thing atomic and serialized.
  await getDb().transaction(async (tx) => {
    // Tenancy boundary, re-checked inside the tx so it shares the snapshot.
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, input.learnerId), eq(learner.accountId, accountId)))
      .limit(1);
    if (!owned[0]) throw new Error("learner not found for account");

    // Curation boundary (Fix-F A4): the learner must be ACTIVELY enrolled in the
    // program. Read inside the same tx (shares the snapshot with the tenancy
    // check above). A removed/paused/missing enrollment → no write at all; the
    // client render-block (A3) is the UX, this is the non-bypassable enforcement.
    const enrolled = await tx
      .select({ status: enrollment.status })
      .from(enrollment)
      .where(enrollmentKey(input.learnerId, input.programSlug))
      .limit(1)
      // Lock the enrollment row for the tx's lifetime so a concurrent pause/remove
      // can't commit between this active-check and the attempt insert below (the
      // skill_state folds already lock FOR UPDATE; this closes the same race here).
      .for("update");
    if (enrolled[0]?.status !== "active") {
      throw new EnrollmentNotActiveError(input.learnerId, input.programSlug);
    }

    // Provenance is written ONLY for a generated attempt (and only when supplied),
    // so an authored row can never carry gen_* metadata even if a caller passes it.
    const generated = input.generated ?? false;
    const provenance = generated ? input.provenance : undefined;
    await tx.insert(attempt).values({
      learnerId: input.learnerId,
      activityId: input.activityId,
      kind: input.kind,
      generated,
      score: input.score,
      response: input.response ?? null,
      day: input.day,
      genModel: provenance?.model ?? null,
      genRoute: provenance?.route ?? null,
      genAt: provenance?.at ?? null,
    });

    // Acquire the per-skill row locks in a deterministic (skill-sorted) order:
    // two concurrent attempts for the same learner with overlapping skills would
    // otherwise be able to lock the same rows in opposite orders and deadlock —
    // which Postgres breaks by aborting one tx, dropping that submit's evidence.
    const evidence = [...input.score.skillEvidence].sort((a, b) => a.skill.localeCompare(b.skill));
    for (const ev of evidence) {
      // Materialize the row (no-op if it already exists), then lock it FOR
      // UPDATE so concurrent folds for the same (learner,skill) serialize on it
      // rather than racing the read-modify-write.
      await tx
        .insert(skillState)
        .values({ learnerId: input.learnerId, skill: ev.skill, evidence: [], outcome: "not_yet" })
        .onConflictDoNothing({ target: [skillState.learnerId, skillState.skill] });
      const locked = await tx
        .select()
        .from(skillState)
        .where(and(eq(skillState.learnerId, input.learnerId), eq(skillState.skill, ev.skill)))
        .limit(1)
        .for("update");
      const row = locked[0];
      if (!row) continue;
      const { history, outcome } = nextSkillRecord(row.evidence, ev.outcome, input.day);
      await tx
        .update(skillState)
        .set({ evidence: history, outcome, updatedAt: new Date() })
        .where(eq(skillState.id, row.id));
    }
  });
}

/** Read the learner's skill_state in the mastery engine's shape (for next-best,
 *  per-strand levels, and the parent report). */
export async function getSkillState(accountId: string, learnerId: string): Promise<SkillState> {
  return withOwnedLearner<SkillState>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb().select().from(skillState).where(eq(skillState.learnerId, learnerId));
      const state: SkillState = {};
      for (const r of rows) {
        state[r.skill as SkillTag] = { history: r.evidence as { day: string; outcome: SkillOutcome }[] };
      }
      return state;
    },
    {},
  );
}

export interface RecentAttempt {
  activityId: string;
  kind: string;
  stars: number;
  day: string;
}

export async function getRecentAttempts(
  accountId: string,
  learnerId: string,
  limit = 8,
): Promise<RecentAttempt[]> {
  return withOwnedLearner<RecentAttempt[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(attempt)
        .where(eq(attempt.learnerId, learnerId))
        .orderBy(desc(attempt.createdAt))
        .limit(limit);
      return rows.map((r) => ({ activityId: r.activityId, kind: r.kind, stars: r.score.stars, day: r.day }));
    },
    [],
  );
}

/** One AI-generated attempt for the parent-visible provenance trail (P6 / §8). */
export interface GeneratedAttempt {
  activityId: string;
  kind: string;
  stars: number;
  /** Logical model route; null for pre-provenance generated rows. */
  model: string | null;
  /** Generation path tag (band or language id); null for pre-provenance rows. */
  route: string | null;
  /** ISO generation time; null when not recorded. */
  generatedAt: string | null;
  /** ISO time the attempt was recorded (always present); the keyset cursor key. */
  createdAt: string;
}

export interface GeneratedAttemptsPage {
  items: GeneratedAttempt[];
  /** Opaque cursor for the next page (ISO createdAt of the last row), or null at the end. */
  nextCursor: string | null;
}

/** Default + hard cap on the provenance page size (keeps the read bounded). */
const PROVENANCE_PAGE_DEFAULT = 20;
const PROVENANCE_PAGE_MAX = 50;

/**
 * The parent-visible "what the AI made" trail (P6 / spec §8): a learner's
 * AI-GENERATED attempts only (generated=true), account-scoped, newest-first,
 * keyset-paginated by createdAt. Reuses the `attempt_learner_generated_idx`
 * (learnerId, generated). Returns an empty page when the learner is not owned by
 * the account (tenancy boundary) — never another account's data.
 *
 * Keyset (not OFFSET) pagination: `cursor` is the ISO createdAt of the last row
 * seen; the next page is the generated attempts strictly older than it. We fetch
 * limit+1 to know whether a further page exists without a second count query.
 */
export async function listGeneratedAttempts(
  accountId: string,
  learnerId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<GeneratedAttemptsPage> {
  return withOwnedLearner<GeneratedAttemptsPage>(
    accountId,
    learnerId,
    async () => {
      const limit = Math.max(1, Math.min(PROVENANCE_PAGE_MAX, opts.limit ?? PROVENANCE_PAGE_DEFAULT));
      const cursorDate = opts.cursor ? new Date(opts.cursor) : null;
      const cursorValid = cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : null;

      const predicate = cursorValid
        ? and(
            eq(attempt.learnerId, learnerId),
            eq(attempt.generated, true),
            lt(attempt.createdAt, cursorValid),
          )
        : and(eq(attempt.learnerId, learnerId), eq(attempt.generated, true));

      const rows = await getDb()
        .select()
        .from(attempt)
        .where(predicate)
        .orderBy(desc(attempt.createdAt))
        .limit(limit + 1); // +1 to detect a further page

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const items: GeneratedAttempt[] = page.map((r) => ({
        activityId: r.activityId,
        kind: r.kind,
        stars: clampStars(r.score.stars),
        model: r.genModel,
        route: r.genRoute,
        generatedAt: r.genAt ? r.genAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }));
      const nextCursor = hasMore ? items[items.length - 1]!.createdAt : null;
      return { items, nextCursor };
    },
    { items: [], nextCursor: null },
  );
}

export interface CompletedActivity {
  activityId: string;
  /** Best stars (0..3) the learner earned on this authored activity. */
  stars: number;
}

/** Clamp any stored stars value to the 0..3 range the UI renders. */
function clampStars(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.round(value)));
}

/**
 * Authored activities the learner has completed (generated practice excluded),
 * each with the best stars earned. This is the account-mode equivalent of the
 * client's "completed" set + best-stars map: it feeds the next-best recommender,
 * the world-map progress rings/locks, and the per-activity star glyphs (so they
 * survive a reload, not just an in-session optimistic update).
 *
 * Best-stars is folded in TS (the score lives in a jsonb column and a learner's
 * attempt volume is small) so there's no fragile jsonb-aggregate SQL.
 */
export async function getCompletedActivityIds(
  accountId: string,
  learnerId: string,
): Promise<CompletedActivity[]> {
  return withOwnedLearner<CompletedActivity[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ activityId: attempt.activityId, score: attempt.score })
        .from(attempt)
        .where(and(eq(attempt.learnerId, learnerId), eq(attempt.generated, false)))
        // Bound this otherwise-unbounded select (one learner's authored-attempt volume
        // is far below this, so the best-stars fold stays complete). Order newest-first
        // so that IF the cap is ever hit the dropped rows are deterministic (the oldest
        // attempts) rather than an arbitrary set; index-backed by attempt_learner_created_idx.
        .orderBy(desc(attempt.createdAt))
        .limit(5000);
      const best = new Map<string, number>();
      for (const r of rows) {
        const stars = clampStars(r.score.stars);
        const prior = best.get(r.activityId) ?? 0;
        if (stars > prior || !best.has(r.activityId)) best.set(r.activityId, Math.max(prior, stars));
      }
      return [...best.entries()].map(([activityId, stars]) => ({ activityId, stars }));
    },
    [],
  );
}

/** Outcome tally across a learner's skills (for the dashboard summary). */
export async function skillOutcomeCounts(
  accountId: string,
  learnerId: string,
  skills: SkillTag[],
): Promise<Record<SkillOutcome, number>> {
  const counts: Record<SkillOutcome, number> = { not_yet: 0, emerging: 0, solid: 0 };
  return withOwnedLearner<Record<SkillOutcome, number>>(
    accountId,
    learnerId,
    async () => {
      if (skills.length === 0) return counts;
      const rows = await getDb()
        .select({ skill: skillState.skill, outcome: skillState.outcome })
        .from(skillState)
        .where(and(eq(skillState.learnerId, learnerId), inArray(skillState.skill, skills)));
      const bySkill = new Map(rows.map((r) => [r.skill, r.outcome as SkillOutcome]));
      for (const s of skills) counts[bySkill.get(s) ?? "not_yet"] += 1;
      return counts;
    },
    counts,
  );
}

// ── Enrollment lifecycle + config + settings ─────────────────────────────────
//
// Write-time validation calls `<schema>.parse(...)` directly at each persistence
// site below. The action layer already validates caller input, but the store is
// the actual persistence boundary, so re-parsing here means malformed data can
// NEVER reach the column (defense-in-depth). Unlike the READ path — which fails
// CLOSED to `{ aiPractice: false }` via parseJsonbFailClosed because corrupt rows
// may already exist — a WRITE fails fast: a bad value throws {ZodError} and is
// never persisted.

/**
 * Upsert a program enrollment for the learner (owned-by-account check first).
 * Insert with status="active" and programVersionId when none exists; if one
 * already exists, restore to active and re-pin the version.
 * Returns false when the learner is not owned by the account (no write); true on
 * success — so the calling action can report not-found instead of a false ok.
 */
export async function assignProgram(
  accountId: string,
  learnerId: string,
  slug: string,
  programVersionId: string | null,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      // A fresh enrollment starts with an empty config; run it through the schema
      // so every config write in this store goes through one validation gate.
      const config = enrollmentConfigSchema.parse({});
      await getDb()
        .insert(enrollment)
        .values({
          learnerId,
          programSlug: slug,
          status: "active",
          config,
          programVersionId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [enrollment.learnerId, enrollment.programSlug],
          set: { status: "active", programVersionId, updatedAt: new Date() },
        });
      return true;
    },
    false,
  );
}

/**
 * Update the enrollment status for a learner's program (owned-by-account).
 * Enforces the transition guard: reads the current status first and no-ops if
 * the transition is not allowed (defense-in-depth against invalid state moves).
 * Returns false when the learner is not owned, no enrollment exists, or the
 * transition is disallowed (no row written); true when the status is updated.
 */
export async function setEnrollmentStatus(
  accountId: string,
  learnerId: string,
  slug: string,
  status: EnrollmentStatus,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      // Read the current row to enforce the transition matrix.
      const rows = await getDb()
        .select({ status: enrollment.status })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return false; // No enrollment row.

      const current = rows[0].status as EnrollmentStatus;
      if (!canTransitionStatus(current, status)) return false;

      await getDb()
        .update(enrollment)
        .set({ status, updatedAt: new Date() })
        .where(enrollmentKey(learnerId, slug));
      return true;
    },
    false,
  );
}

/**
 * Update the enrollment config for a learner's program (owned-by-account).
 * Returns false when the learner is not owned or no matching enrollment row
 * exists (no write); true when the config is updated.
 * @throws {ZodError} when `config` fails schema validation (never persisted).
 */
export async function setEnrollmentConfig(
  accountId: string,
  learnerId: string,
  slug: string,
  config: EnrollmentConfig,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      // Validate before persisting: a malformed config must never reach the column
      // (defense-in-depth behind the action-layer parse). @throws {ZodError}.
      const validated = enrollmentConfigSchema.parse(config);
      const updated = await getDb()
        .update(enrollment)
        .set({ config: validated, updatedAt: new Date() })
        .where(enrollmentKey(learnerId, slug))
        .returning({ id: enrollment.id });
      return updated.length > 0;
    },
    false,
  );
}

/**
 * All enrollments for the learner (owned-by-account), mapped to EnrollmentDetail.
 * Returns an empty array when the learner is not owned by the account.
 */
export async function listEnrollmentsDetailed(
  accountId: string,
  learnerId: string,
): Promise<EnrollmentDetail[]> {
  return withOwnedLearner<EnrollmentDetail[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(enrollment)
        .where(eq(enrollment.learnerId, learnerId));
      return rows.map((r) => ({
        slug: r.programSlug,
        status: r.status as EnrollmentStatus,
        config: r.config as EnrollmentConfig,
        programVersionId: r.programVersionId,
        startedAt: r.startedAt,
      }));
    },
    [],
  );
}

// The fail-closed defensive parse for both AI-gate jsonb columns lives in
// parseJsonbFailClosed (./jsonb): on a corrupt value it returns
// `{ aiPractice: false }` (block AI), never `{}` (allow). Each read below calls it
// with the column's schema and a descriptor that is logged as `malformed <ctx>`.

/**
 * Read the enrollment config for a specific (learner, program) pair (owned-by-account).
 * Returns {} when the learner is not owned by the account or no enrollment exists.
 * safeParses the stored jsonb so a malformed value can't fail-open the §8 gate
 * (a corrupt config fails CLOSED to `{ aiPractice: false }`, not `{}`).
 */
export async function getEnrollmentConfig(
  accountId: string,
  learnerId: string,
  slug: string,
): Promise<EnrollmentConfig> {
  return withOwnedLearner<EnrollmentConfig>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ config: enrollment.config })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return {};
      return parseJsonbFailClosed(
        enrollmentConfigSchema,
        rows[0].config,
        `enrollment config (learner=${learnerId} slug=${slug})`,
      );
    },
    {},
  );
}

/**
 * Read the enrollment's pinned program version for a (learner, program) pair
 * (owned-by-account). Returns:
 *   - `{ programVersionId }` when an enrollment row exists (the id may be null
 *     for a lazy/default enrollment that was never pinned to a specific version),
 *   - `null` when the learner is not owned OR no enrollment row exists.
 *
 * The learner surface uses this to honor the version pin: a learner pinned to an
 * older version keeps seeing THAT version's tree (and scopes progress to it) even
 * after a newer version is published. Status is intentionally NOT consulted here
 * — pinning is about WHICH tree to render; the §8 AI gate (getEnrollmentForGate)
 * separately enforces active-enrollment before any generation.
 */
export async function getEnrollmentVersionId(
  accountId: string,
  learnerId: string,
  slug: string,
): Promise<{ programVersionId: string | null } | null> {
  return withOwnedLearner<{ programVersionId: string | null } | null>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ programVersionId: enrollment.programVersionId })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return null;
      return { programVersionId: rows[0].programVersionId };
    },
    null,
  );
}

/**
 * §8 AI-gate read: the enrollment row's status + safeParsed config for a
 * (learner, program) pair (owned-by-account). Returns null when the learner is
 * not owned OR no enrollment row exists — both of which the gate treats as
 * fail-closed (no AI). A soft-removed enrollment returns status "removed" (not
 * resurrected), so the gate keeps blocking it.
 */
export async function getEnrollmentForGate(
  accountId: string,
  learnerId: string,
  slug: string,
): Promise<{ status: EnrollmentStatus; config: EnrollmentConfig } | null> {
  return withOwnedLearner<{ status: EnrollmentStatus; config: EnrollmentConfig } | null>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ status: enrollment.status, config: enrollment.config })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return null;
      return {
        status: rows[0].status as EnrollmentStatus,
        config: parseJsonbFailClosed(
          enrollmentConfigSchema,
          rows[0].config,
          `enrollment config (gate learner=${learnerId} slug=${slug})`,
        ),
      };
    },
    null,
  );
}

/**
 * §8 AI-gate read: the per-learner settings (owned-by-account), safeParsed.
 * Returns null when the learner is not owned by the account; {} when the row
 * has no/empty settings; `{ aiPractice: false }` (fail-closed) when the stored
 * settings are malformed. The gate reads `settings?.aiPractice === false` as the
 * top-level (all-programs) parental kill-switch.
 */
export async function getLearnerSettings(
  accountId: string,
  learnerId: string,
): Promise<LearnerSettings | null> {
  // One account-scoped select that ALSO reads the `settings` column (which the
  // LearnerRow projection doesn't carry) — so this stays inline rather than
  // going through withOwnedLearner (which would add a second ownership query).
  const rows = await getDb()
    .select({ settings: learner.settings })
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  if (!rows[0]) return null;
  return parseJsonbFailClosed(
    learnerSettingsSchema,
    rows[0].settings,
    `learner settings (gate learner=${learnerId})`,
  );
}

/**
 * Update the learner's settings (owned-by-account).
 * Returns false when the learner is not owned by the account (no write); true on
 * success. Scopes the write to (id, accountId) so the ownership check and the
 * update can't drift, and uses the affected-row count as the source of truth.
 * @throws {ZodError} when `settings` fails schema validation (never persisted).
 */
export async function saveLearnerSettings(
  accountId: string,
  learnerId: string,
  settings: LearnerSettings,
): Promise<boolean> {
  // Validate before persisting: malformed settings must never reach the column
  // (defense-in-depth behind the action-layer parse). @throws {ZodError}.
  const validated = learnerSettingsSchema.parse(settings);
  const updated = await getDb()
    .update(learner)
    .set({ settings: validated, updatedAt: new Date() })
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .returning({ id: learner.id });
  return updated.length > 0;
}

// ── Per-child data export + profile delete (spec §8) ─────────────────────────

/**
 * Gather the owned learner's full data and shape it into the minimized export
 * format (spec §8). Returns null when the learner does not exist or is not
 * owned by the account (tenancy boundary).
 *
 * The caller (action) stamps `exportedAt` so the pure shaper stays free of
 * `new Date()` and remains unit-testable without mocks.
 */
export async function buildLearnerExport(
  accountId: string,
  learnerId: string,
  exportedAt: string,
): Promise<LearnerExport | null> {
  // Ownership check that ALSO returns the FULL learner row (gatherLearnerExport
  // needs settings + every column) — so this stays inline rather than going
  // through withOwnedLearner, whose LearnerRow projection drops settings.
  const rows = await getDb()
    .select()
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  if (!rows[0]) return null;
  return gatherLearnerExport(rows[0], exportedAt);
}

/**
 * Gather one OWNED learner row's full data and shape it into the minimized
 * export. Factored out so {@link buildLearnerExport} (single child) and
 * {@link buildAccountExport} (all children) share one gather + shape with no
 * duplicate ownership logic: the caller has ALREADY established the row belongs
 * to the account (via the scoped select / listLearners), so this takes the row
 * directly. Reads only; injects `exportedAt` so the pure shaper stays mock-free.
 */
async function gatherLearnerExport(
  learnerRow: typeof learner.$inferSelect,
  exportedAt: string,
): Promise<LearnerExport> {
  const learnerId = learnerRow.id;
  // Gather all related data in parallel (no write, just reads).
  const [enrollmentRows, skillStateRows, attemptRows] = await Promise.all([
    getDb().select().from(enrollment).where(eq(enrollment.learnerId, learnerId)),
    getDb().select().from(skillState).where(eq(skillState.learnerId, learnerId)),
    getDb()
      .select()
      .from(attempt)
      .where(eq(attempt.learnerId, learnerId))
      .orderBy(desc(attempt.createdAt)),
  ]);

  return shapeLearnerExport({
    exportedAt,
    learner: {
      id: learnerRow.id,
      displayName: learnerRow.displayName,
      birthMonth: learnerRow.birthMonth,
      // learner.settings / enrollment.config are jsonb `$type<...>()` columns, so
      // Drizzle already infers the right type here — no cast needed.
      settings: learnerRow.settings,
    },
    enrollments: enrollmentRows.map((e) => ({
      programSlug: e.programSlug,
      status: e.status,
      config: e.config,
    })),
    skillState: skillStateRows.map((s) => ({
      skill: s.skill,
      outcome: s.outcome,
      evidence: (s.evidence as { day: string; outcome: string }[]) ?? [],
    })),
    attempts: attemptRows.map((a) => ({
      activityId: a.activityId,
      kind: a.kind,
      score: a.score as { stars: number; correct: number; total: number; skillEvidence: unknown[] },
      // The child's own response (journal text, drawings, answers) — exported in
      // full for COPPA "export … all its data" (shaped in export.ts).
      response: a.response,
      day: a.day,
      createdAt: a.createdAt,
      // Provenance (P6): carried for generated rows so the export includes the
      // "what the AI made" trail. The shaper filters to generated attempts.
      generated: a.generated,
      genModel: a.genModel,
      genRoute: a.genRoute,
      genAt: a.genAt,
    })),
  });
}

/**
 * Build the WHOLE-ACCOUNT export (P6 / spec §8 "export … all its data"): the
 * parent record (minimized — id/email/createdAt, NEVER password/tokens) plus
 * every learner the account owns, each shaped by the same per-child gatherer
 * (so provenance + minimization land once). Account-scoped: only this account's
 * learners are included. The caller (action) injects `exportedAt`.
 *
 * Returns null when the parent `user` row can't be found (e.g. the account was
 * deleted mid-request) — the action turns that into a calm "unavailable".
 */
export async function buildAccountExport(
  accountId: string,
  exportedAt: string,
): Promise<AccountExport | null> {
  // The parent record — minimized. Read ONLY the non-sensitive columns; the
  // password/token columns live on the Better Auth `account` table, never here,
  // but we still select explicitly so a future `user` column can't leak by
  // default into the export.
  const userRows = await getDb()
    .select({ id: user.id, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, accountId))
    .limit(1);
  if (!userRows[0]) return null;
  const account = {
    id: userRows[0].id,
    email: userRows[0].email,
    createdAt: userRows[0].createdAt.toISOString(),
  };

  // Every learner the account owns (listLearners is already account-scoped, so
  // this is the per-account ownership check — no second check per learner).
  const learnerRows = await getDb()
    .select()
    .from(learner)
    .where(eq(learner.accountId, accountId))
    .orderBy(learner.createdAt);
  const learners = await Promise.all(
    learnerRows.map((row) => gatherLearnerExport(row, exportedAt)),
  );

  return shapeAccountExport({ exportedAt, account, learners });
}

/**
 * Delete a child profile (and all its data via cascade). Returns true if the
 * learner was found and deleted, false if not owned or not found (tenancy boundary).
 *
 * FK cascade: `enrollment`, `attempt`, and `skill_state` all have
 * `onDelete: "cascade"` on `learner.id`, so deleting the learner row removes
 * everything. No orphan cleanup needed.
 */
export async function deleteLearner(
  accountId: string,
  learnerId: string,
): Promise<boolean> {
  const deleted = await getDb()
    .delete(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .returning({ id: learner.id });
  return deleted.length > 0;
}

/** What {@link deleteAccount} did, for the confirmation screen / action result. */
export interface DeleteAccountResultData {
  /** False when no `user` row matched the id (already gone) — nothing deleted. */
  deleted: boolean;
  deletedLearners: number;
  deletedAttempts: number;
}

/**
 * Hard-delete the WHOLE account: the parent `user` row and everything that
 * cascades off it (P6 / spec §8 "delete … all its data"). One
 * `DELETE FROM "user" WHERE id = ?` does the work via Postgres FKs:
 *
 *   user ─┬─ learner          (cascade) ─→ enrollment, attempt, skill_state (cascade)
 *         ├─ session          (cascade, auth-schema)
 *         └─ account          (cascade, auth-schema — Better Auth credentials/oauth)
 *   publisher.ownerUserId      (set null) — a published program does NOT vanish when
 *                                           its author closes their account; ownership nulls
 *
 * A {@link deletionAudit} row is written FIRST, inside the same transaction, so
 * the audit (which has NO FK to `user`) survives the cascade it records. Counts
 * are snapshot before the delete for that record + the confirmation screen.
 *
 * Hard delete by design (consistent with deleteLearner + the "delete … always"
 * promise; a soft-delete would leave child data after a parent asked to remove
 * it — arguably worse for COPPA). Audio is intentionally untouched: clips are
 * shared + content-addressed + reference no learner/account (no PII).
 */
export async function deleteAccount(accountId: string): Promise<DeleteAccountResultData> {
  return getDb().transaction(async (tx) => {
    // Snapshot counts for the audit + confirmation (cheap; before the cascade).
    const [learnerCountRow] = await tx
      .select({ value: count() })
      .from(learner)
      .where(eq(learner.accountId, accountId));
    const learnerCount = learnerCountRow?.value ?? 0;

    // attempt has no account_id; scope its count through the account's learners.
    const learnerIdRows = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(eq(learner.accountId, accountId));
    const learnerIds = learnerIdRows.map((r) => r.id);
    let attemptCount = 0;
    if (learnerIds.length > 0) {
      const [attemptCountRow] = await tx
        .select({ value: count() })
        .from(attempt)
        .where(inArray(attempt.learnerId, learnerIds));
      attemptCount = attemptCountRow?.value ?? 0;
    }

    // Audit FIRST (no FK to user → survives the cascade below).
    await tx.insert(deletionAudit).values({
      userId: accountId,
      learnerCount,
      attemptCount,
      requestedBy: "parent",
    });

    // Better Auth's `verification` table has NO FK to user, so the user-delete
    // cascade below MISSES it. Delete this parent's verification rows (keyed by the
    // email identifier — Better Auth's email-verify/password-reset tokens are keyed
    // by email) so account deletion truly removes ALL auth artifacts (COPPA "delete
    // … all its data"). Usually empty today (email verification is off, P4 Stage 2),
    // but correct + future-proof once reset/verify flows populate it.
    const [u] = await tx
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, accountId))
      .limit(1);
    if (u?.email) {
      // Cover BOTH key shapes Better Auth uses: email-verification rows keyed by
      // `identifier = email`, AND password-reset / delete-account tokens keyed by
      // `identifier = "<flow>:<token>"` with `value = user.id`. Match either so no
      // auth artifact survives.
      await tx
        .delete(verification)
        .where(or(eq(verification.identifier, u.email), eq(verification.value, accountId)));
    }

    // The single delete the whole cascade hangs off.
    const deletedUsers = await tx
      .delete(user)
      .where(eq(user.id, accountId))
      .returning({ id: user.id });

    return {
      deleted: deletedUsers.length > 0,
      deletedLearners: learnerCount,
      deletedAttempts: attemptCount,
    };
  });
}
