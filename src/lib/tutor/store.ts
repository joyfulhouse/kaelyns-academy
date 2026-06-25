// server-only: this module opens DB connections and must never be imported into
// a Client Component. (the `server-only` package isn't installed; this comment
// is the guard, and only server actions / route handlers import it.)
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attempt, enrollment, learner, skillState } from "@/lib/db/schema";
import type { ActivityScore, SkillOutcome, SkillTag } from "@/content";
import { captureNonCritical } from "@/lib/capture";
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

/**
 * The DB-backed tutor store: the server equivalent of the client's
 * useSkillState. Every read/write is scoped to an account (the Better Auth
 * user), so one parent can only ever touch their own learners' data (spec §7).
 * The mastery engine (deriveOutcome) is applied here so client and server agree
 * on what "solid" means.
 */

export interface LearnerRow {
  id: string;
  accountId: string;
  displayName: string;
  avatar: string | null;
  birthMonth: string | null;
}

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

function toRow(r: typeof learner.$inferSelect): LearnerRow {
  return {
    id: r.id,
    accountId: r.accountId,
    displayName: r.displayName,
    avatar: r.avatar,
    birthMonth: r.birthMonth,
  };
}

export async function listLearners(accountId: string): Promise<LearnerRow[]> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(eq(learner.accountId, accountId))
    .orderBy(learner.createdAt);
  return rows.map(toRow);
}

/** Scoped fetch: returns null if the learner doesn't exist OR isn't this account's. */
export async function getLearner(accountId: string, learnerId: string): Promise<LearnerRow | null> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  return rows[0] ? toRow(rows[0]) : null;
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
  return toRow(rows[0]);
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
  const rows = await getDb()
    .select({ programSlug: enrollment.programSlug })
    .from(enrollment)
    .where(eq(enrollment.learnerId, learnerId));
  return rows.map((r) => r.programSlug);
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
      .where(
        and(eq(enrollment.learnerId, input.learnerId), eq(enrollment.programSlug, input.programSlug)),
      )
      .limit(1);
    if (enrolled[0]?.status !== "active") {
      throw new EnrollmentNotActiveError(input.learnerId, input.programSlug);
    }

    await tx.insert(attempt).values({
      learnerId: input.learnerId,
      activityId: input.activityId,
      kind: input.kind,
      generated: input.generated ?? false,
      score: input.score,
      response: input.response ?? null,
      day: input.day,
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return {};
  const rows = await getDb().select().from(skillState).where(eq(skillState.learnerId, learnerId));
  const state: SkillState = {};
  for (const r of rows) {
    state[r.skill as SkillTag] = { history: r.evidence as { day: string; outcome: SkillOutcome }[] };
  }
  return state;
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
  const rows = await getDb()
    .select()
    .from(attempt)
    .where(eq(attempt.learnerId, learnerId))
    .orderBy(desc(attempt.createdAt))
    .limit(limit);
  return rows.map((r) => ({ activityId: r.activityId, kind: r.kind, stars: r.score.stars, day: r.day }));
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
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
}

/** Outcome tally across a learner's skills (for the dashboard summary). */
export async function skillOutcomeCounts(
  accountId: string,
  learnerId: string,
  skills: SkillTag[],
): Promise<Record<SkillOutcome, number>> {
  const owned = await getLearner(accountId, learnerId);
  const counts: Record<SkillOutcome, number> = { not_yet: 0, emerging: 0, solid: 0 };
  if (!owned || skills.length === 0) return counts;
  const rows = await getDb()
    .select({ skill: skillState.skill, outcome: skillState.outcome })
    .from(skillState)
    .where(and(eq(skillState.learnerId, learnerId), inArray(skillState.skill, skills)));
  const bySkill = new Map(rows.map((r) => [r.skill, r.outcome as SkillOutcome]));
  for (const s of skills) counts[bySkill.get(s) ?? "not_yet"] += 1;
  return counts;
}

// ── Enrollment lifecycle + config + settings ─────────────────────────────────

/**
 * Write-time validation for the enrollment `config` jsonb. The action layer
 * already validates caller input, but this store fn is the actual persistence
 * boundary and is exported for other server callers (seeds, future actions,
 * tests). Validating here means malformed data can NEVER be persisted, mirroring
 * the read-side defensive parse — and unlike the read (which fails CLOSED to
 * `{ aiPractice: false }` because corrupt rows already exist), a write fails
 * fast: a bad config must never reach the column. @throws {ZodError}.
 */
function validateEnrollmentConfig(config: EnrollmentConfig): EnrollmentConfig {
  return enrollmentConfigSchema.parse(config);
}

/** Write-time validation for the per-learner `settings` jsonb. Same rationale as
 *  {@link validateEnrollmentConfig}: reject malformed data before it persists. */
function validateLearnerSettings(settings: LearnerSettings): LearnerSettings {
  return learnerSettingsSchema.parse(settings);
}

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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return false;
  // A fresh enrollment starts with an empty config; run it through the schema so
  // every config write in this store goes through one validation gate.
  const config = validateEnrollmentConfig({});
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return false;

  // Read the current row to enforce the transition matrix.
  const rows = await getDb()
    .select({ status: enrollment.status })
    .from(enrollment)
    .where(and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, slug)))
    .limit(1);
  if (!rows[0]) return false; // No enrollment row.

  const current = rows[0].status as EnrollmentStatus;
  if (!canTransitionStatus(current, status)) return false;

  await getDb()
    .update(enrollment)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, slug)));
  return true;
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return false;
  // Validate before persisting: a malformed config must never reach the column
  // (defense-in-depth behind the action-layer parse). @throws {ZodError}.
  const validated = validateEnrollmentConfig(config);
  const updated = await getDb()
    .update(enrollment)
    .set({ config: validated, updatedAt: new Date() })
    .where(and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, slug)))
    .returning({ id: enrollment.id });
  return updated.length > 0;
}

/**
 * All enrollments for the learner (owned-by-account), mapped to EnrollmentDetail.
 * Returns an empty array when the learner is not owned by the account.
 */
export async function listEnrollmentsDetailed(
  accountId: string,
  learnerId: string,
): Promise<EnrollmentDetail[]> {
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
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
}

/**
 * Parse a stored enrollment config jsonb defensively, failing CLOSED on
 * corruption. A legitimately empty/absent config stays `{}` (default-allow —
 * the §8 gate only blocks on `aiPractice === false`). But a value that FAILS to
 * parse (e.g. a hand-edited row with `aiPractice: "false"`) could have been
 * meant to disable AI, and degrading it to `{}` would leave `aiPractice`
 * undefined → the gate would NOT block → fail-open. So on parse failure we log
 * and return `{ aiPractice: false }`, which blocks AI for that corrupt row.
 */
function parseEnrollmentConfig(raw: unknown, context: string): EnrollmentConfig {
  const parsed = enrollmentConfigSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  captureNonCritical(`malformed enrollment config (${context})`, parsed.error);
  return { aiPractice: false };
}

/** Same defensive, fail-closed parse for the per-learner settings jsonb: a
 *  malformed value yields `{ aiPractice: false }` (block), never `{}` (allow). */
function parseLearnerSettings(raw: unknown, context: string): LearnerSettings {
  const parsed = learnerSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  captureNonCritical(`malformed learner settings (${context})`, parsed.error);
  return { aiPractice: false };
}

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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return {};
  const rows = await getDb()
    .select({ config: enrollment.config })
    .from(enrollment)
    .where(and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, slug)))
    .limit(1);
  if (!rows[0]) return {};
  return parseEnrollmentConfig(rows[0].config, `learner=${learnerId} slug=${slug}`);
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return null;
  const rows = await getDb()
    .select({ programVersionId: enrollment.programVersionId })
    .from(enrollment)
    .where(and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, slug)))
    .limit(1);
  if (!rows[0]) return null;
  return { programVersionId: rows[0].programVersionId };
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
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return null;
  const rows = await getDb()
    .select({ status: enrollment.status, config: enrollment.config })
    .from(enrollment)
    .where(and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, slug)))
    .limit(1);
  if (!rows[0]) return null;
  return {
    status: rows[0].status as EnrollmentStatus,
    config: parseEnrollmentConfig(rows[0].config, `gate learner=${learnerId} slug=${slug}`),
  };
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
  const rows = await getDb()
    .select({ settings: learner.settings })
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  if (!rows[0]) return null;
  return parseLearnerSettings(rows[0].settings, `gate learner=${learnerId}`);
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
  const validated = validateLearnerSettings(settings);
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
  // Ownership check: must belong to this account.
  const rows = await getDb()
    .select()
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  if (!rows[0]) return null;
  const learnerRow = rows[0];

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
      day: a.day,
      createdAt: a.createdAt,
    })),
  });
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
