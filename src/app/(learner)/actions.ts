"use server";

import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, requireAccount, withAccount } from "@/lib/tenancy";
import {
  EnrollmentNotActiveError,
  ensureDefaultLearner,
  ensureEnrollment,
  getCompletedActivityIds,
  getEnrollmentConfig,
  getEnrollmentForGate,
  getGeneratedActivity,
  getGeneratedCompletions,
  getLearner,
  getLearnerSettings,
  getSkillState,
  listEnrollmentsDetailed,
  listGeneratedShelf,
  recordAttempt,
  withLessonGenerationLock,
  type NewGeneratedActivity,
  type ShelfItem,
} from "@/lib/tutor/store";
import type { EnrollmentConfig, LearnerSurfaceConfig } from "@/lib/content/config";
import {
  activityIdsForProgram,
  findActivity,
  getUnit,
  skillTagsForProgram,
} from "@/content";
import type { Band, Lesson, Program, Unit } from "@/content";
import { generatePracticeItems, provenanceForGeneration } from "@/lib/ai/practice";
import {
  pickGenerationTargets,
  shelfCompletions,
  SHELF_LESSON_CAP,
} from "@/lib/tutor/shelf";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { findUnitIdOfActivity } from "@/lib/quests/logic";
import type { SkillState } from "@/lib/tutor";

/**
 * Learner-surface server actions: the DB-backed half of the kid experience.
 *
 * When a parent/household is signed in these persist to the account-scoped
 * learner / attempt / skill_state tables (so progress survives across devices
 * and feeds the parent report). When NOT signed in, the client falls back to
 * its localStorage guest mode and never calls these.
 *
 * Posture (spec §8): all of these are forgiving by construction. They resolve
 * the session lazily per-request (build-safe — no getAuth()/getDb() at module
 * top level) and NEVER throw to the client. Session resolution distinguishes a
 * signed-out guest from a retryable service failure; other actions return calm
 * empty/`ok:false` results.
 */

/**
 * The default program a new household learner is auto-enrolled into, so existing
 * users keep their core curriculum unchanged. Additional programs (e.g.
 * world-languages) are enrolled lazily when the learner first opens them.
 */
const DEFAULT_PROGRAM_SLUG = "kaelyn-adaptive";

/** A learner as the kid surface needs it (a stable, client-safe shape). */
export interface TutorLearner {
  id: string;
  displayName: string;
  /** A friendly avatar emoji; the DB has none yet, so the surface supplies one. */
  avatar: string;
  birthMonth: string | null;
}

export type TutorSession =
  | { status: "authenticated"; learners: TutorLearner[] }
  | { status: "unauthenticated"; learners: [] }
  | { status: "error"; learners: [] };

/** Default avatars cycled across an account's learners (DB stores no avatar). */
const AVATARS = ["🦊", "🐢", "🦉", "🐰", "🐼", "🦋"] as const;

function avatarFor(index: number): string {
  return AVATARS[index % AVATARS.length];
}

/**
 * Resolve whether a household is signed in and, if so, its learner profiles.
 * Unauthenticated is a normal state (guest mode), not an error.
 */
export async function getTutorSession(): Promise<TutorSession> {
  try {
    const { accountId } = await requireAccount();
    const { listLearners } = await import("@/lib/tutor/store");
    const rows = await listLearners(accountId);
    return {
      status: "authenticated",
      learners: rows.map((r, i) => ({
        id: r.id,
        displayName: r.displayName,
        avatar: r.avatar ?? avatarFor(i),
        birthMonth: r.birthMonth,
      })),
    };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { status: "unauthenticated", learners: [] };
    }
    captureNonCritical("getTutorSession failed", error);
    return { status: "error", learners: [] };
  }
}

/**
 * Ensure the signed-in household has at least one learner (so an authed kid
 * with no profile still works), enrolled in the pilot program. Returns the
 * learner, or null if unauthenticated / on failure.
 */
export async function ensureHouseholdLearner(): Promise<TutorLearner | null> {
  try {
    return await withAccount(async ({ accountId }) => {
      const { headers } = await import("next/headers");
      const { getAuth } = await import("@/lib/auth");
      const session = await getAuth().api.getSession({ headers: await headers() });
      const displayName = session?.user?.name?.trim() || "Explorer";
      const learner = await ensureDefaultLearner(accountId, { displayName });
      await ensureEnrollment(learner.id, DEFAULT_PROGRAM_SLUG);
      return {
        id: learner.id,
        displayName: learner.displayName,
        avatar: learner.avatar ?? avatarFor(0),
        birthMonth: learner.birthMonth,
      };
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("ensureHouseholdLearner failed", error);
    }
    return null;
  }
}

/**
 * The program slugs the learner is **actively** enrolled in (status === "active").
 * Drives the `/learn` picker: one enrollment auto-redirects; several render tiles.
 * Paused or removed programs are hidden — parents can restore them at any time.
 * Returns [] when unauthenticated or on failure (the picker then falls back to
 * showing every program, which is also the guest-mode behavior).
 */
export async function getEnrollmentsAction(learnerId: string): Promise<string[]> {
  if (!learnerId) return [];
  try {
    return await withAccount(async ({ accountId }) => {
      const all = await listEnrollmentsDetailed(accountId, learnerId);
      return all.filter((e) => e.status === "active").map((e) => e.slug);
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getEnrollmentsAction failed", error);
    }
    return [];
  }
}

const skillEvidenceSchema = z.object({
  skill: z.string().min(1).max(60),
  outcome: z.enum(["not_yet", "emerging", "solid"]),
});

/**
 * AI provenance echoed back from /api/practice for a generated item (P6 / §8).
 * Bound metadata only (model/route names + a generation timestamp); the route
 * derives these server-side, the client just relays them onto the attempt. The
 * model/route are short audit tags (bounded like `kind`); `at` is an ISO string.
 * Only honored when `generated` is true (see below) — never persisted on authored
 * rows. Light bounds because this is non-authoritative display metadata, not a
 * gate; the §8 enforcement lives in /api/practice + the active-enrollment check.
 */
const provenanceSchema = z.object({
  model: z.string().min(1).max(60),
  route: z.string().min(1).max(60),
  at: z.string().datetime(),
});

const recordAttemptSchema = z.object({
  learnerId: z.string().min(1),
  programSlug: z.string().min(1),
  activityId: z.string().min(1),
  kind: z.string().min(1).max(60),
  generated: z.boolean().optional(),
  response: z.unknown().optional(),
  score: z.object({
    correct: z.number().int().min(0),
    total: z.number().int().min(0),
    stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    skillEvidence: z.array(skillEvidenceSchema),
  }),
  /** Provenance for a generated attempt; ignored unless `generated` is true. */
  gen: provenanceSchema.optional(),
});

export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;

export type RecordResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "invalid" | "inactive" | "error" };

/**
 * Persist one completed activity (authored or AI-generated practice) and fold
 * its skill evidence into the learner's skill_state. The day is stamped from
 * the server clock so the mastery gate's "distinct days" rule is consistent.
 *
 * Server-authoritative curation gate (Fix-F A4): `recordAttempt` verifies the
 * learner has an ACTIVE enrollment for `programSlug` inside the same transaction
 * (after the tenancy re-check). A removed/paused/missing enrollment throws
 * EnrollmentNotActiveError → no attempt or skill_state is written, and the
 * caller gets `reason: "inactive"`. This makes the kid-surface render-block (A3)
 * non-bypassable even via a direct API call with a stale/unassigned program.
 *
 * Star-economy membership witness (Codex critical): the client supplies
 * `activityId` and `score.stars`, so an authored attempt (`generated: false`)
 * MUST be verified against the learner's own pinned program tree before it can
 * earn ledger stars — otherwise a forged request with a fresh, never-authored
 * activityId would credit `activity_complete` stars unbounded (no prior attempt
 * exists to trip the "already completed" guard). `findUnitIdOfActivity` doubles
 * as that witness: a non-null `unitId` proves `activityId` belongs to the
 * resolved tree. A resolved tree with no match is rejected outright (`invalid`)
 * — a legitimate client only ever plays authored activities from that tree. An
 * UNRESOLVABLE tree (DB blip) stays forgiving: the attempt is still recorded
 * (mastery/skill folds are unaffected either way) but `creditEligible` is
 * false, so no star ledger row is written off an unverifiable claim.
 */
export async function recordAttemptAction(input: RecordAttemptInput): Promise<RecordResult> {
  const parsed = recordAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const data = parsed.data;

  const generated = data.generated ?? false;
  // Provenance is honored only for a generated attempt: parse the echoed ISO
  // timestamp into a Date here (the store column is timestamptz). recordAttempt
  // additionally drops it for non-generated rows as defense-in-depth.
  const provenance =
    generated && data.gen
      ? { model: data.gen.model, route: data.gen.route, at: new Date(data.gen.at) }
      : undefined;

  try {
    return await withAccount(async ({ accountId }): Promise<RecordResult> => {
      // Quest-fold context (Adventure 2.0) AND the star-earn membership witness:
      // locate the containing unit on the learner's pinned tree, server-derived —
      // never trusted from the client. Unresolvable (resolver failure/unknown
      // program) degrades to complete_n-only quest matching and no star credit,
      // rather than failing the attempt write.
      let program: Program | null = null;
      try {
        program = (await resolveLearnerProgram(accountId, data.learnerId, data.programSlug)) ?? null;
      } catch {
        program = null;
      }
      const unitId: string | null = program ? findUnitIdOfActivity(program, data.activityId) : null;
      const unit = program && unitId ? getUnit(program, unitId) : null;
      const checkpointPhase = unit?.checkpoint ?? null;

      // Generated shelf witness (Adventure 2.0 B3): a GENERATED attempt whose
      // activityId is a real shelf row OWNED BY THIS LEARNER is a legitimate
      // one-time star earner. The ownership-checked read is the witness (scoped
      // to accountId AND learnerId), exactly like `creditEligible` is for
      // authored activities — a forged shelf id from another learner returns null
      // and earns nothing. A found row also gives the containing unit (for
      // unit-targeted quests). The in-session "More" practice path (generated but
      // activityId = an AUTHORED id) finds no shelf row → shelfEligible stays
      // false, unchanged. Only queried for generated attempts (authored ids are
      // never on the shelf).
      let shelfEligible = false;
      let shelfUnitId: string | null = null;
      if (generated) {
        const shelfRow = await getGeneratedActivity(accountId, data.learnerId, data.activityId);
        if (shelfRow) {
          shelfEligible = true;
          shelfUnitId = shelfRow.unitKey;
        }
      }

      // An authored attempt whose activityId is NOT in the learner's resolved
      // tree is a forgery attempt (a fresh/arbitrary id) — reject before any
      // write. A generated (AI practice) attempt is exempt: synthetic practice
      // ids are legitimate there and never earn ledger stars anyway.
      if (!generated && program && unitId === null) {
        return { ok: false, reason: "invalid" };
      }

      // Server-derived, never client-supplied: true only for an authored attempt
      // verified against the learner's own pinned tree. Gates the star-ledger
      // earn in recordAttempt; the attempt/skill_state folds are unaffected.
      const creditEligible = !generated && unitId !== null;
      if (!program) {
        captureNonCritical(
          "recordAttemptAction: program unresolvable; attempt recorded without star credit",
          new Error(`learnerId=${data.learnerId} programSlug=${data.programSlug}`),
        );
      }

      await recordAttempt(accountId, {
        learnerId: data.learnerId,
        programSlug: data.programSlug,
        activityId: data.activityId,
        kind: data.kind,
        generated,
        response: data.response,
        score: data.score,
        day: new Date().toISOString().slice(0, 10),
        provenance,
        // A verified shelf item carries its own unit (for unit-targeted quests);
        // otherwise the authored-tree unit (null when unresolvable / generated
        // in-session practice keeps its authored unit).
        unitId: shelfEligible ? shelfUnitId : unitId,
        creditEligible,
        shelfEligible,
        checkpointPhase,
      });
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, reason: "unauthenticated" };
    if (error instanceof EnrollmentNotActiveError) return { ok: false, reason: "inactive" };
    captureNonCritical("recordAttemptAction failed", error);
    return { ok: false, reason: "error" };
  }
}

export interface LearnerStateResult {
  skillState: SkillState;
  /**
   * Distinct activity ids the learner has completed: authored activity ids PLUS
   * the ids of any played generated shelf item (a durable, one-time earner).
   */
  completedActivityIds: string[];
  /**
   * Best stars (0..3) per completed activity (for star glyphs). Keyed by authored
   * activity id AND by generated shelf id — a shelf item is a durable, one-time
   * earner, so its stars must survive the reconcile like an authored activity's.
   */
  starsByActivity: Record<string, number>;
  /**
   * The learner's durable AI-generated "fresh practice" shelf for this program
   * (Adventure 2.0 B3), oldest-first. Empty when unauthenticated / on failure /
   * guest mode; the kid surface renders it as the per-lesson "made for you"
   * section + the next-thing fallback.
   */
  generatedShelf: ShelfItem[];
  /** Per-child, per-program enrollment config set by the parent (empty object if none). */
  config: LearnerSurfaceConfig;
  /**
   * The learner's resolved (version-pinned) program tree — the SAME tree this
   * state is scoped to. Null when unauthenticated, on failure, or for an unknown
   * slug; the client then renders the server-passed published prop. Returning it
   * here guarantees the rendered map and the scoped progress are the same version
   * in one round-trip (C#5 consistency).
   */
  program: Program | null;
  /**
   * Whether the account learner may play this program (Fix-F A2): true ONLY when
   * the learner has an ACTIVE enrollment for `slug`. False for removed/paused/no
   * enrollment — and the result then carries NO playable `program` (the client
   * shows the calm "ask a grown-up" state in account mode). Always false for
   * guest/unauth/failure; the client only enforces it in `mode === "account"`,
   * so guest mode keeps playing the published prop unaffected.
   */
  available: boolean;
}

const EMPTY_STATE: LearnerStateResult = {
  skillState: {},
  completedActivityIds: [],
  starsByActivity: {},
  generatedShelf: [],
  config: {},
  program: null,
  available: false,
};

/**
 * Read a learner's mastery state + completed authored activities for ONE program
 * (the data the adaptive UI needs: next-best, per-strand levels, completion
 * checks, stars). The DB stores skill_state and attempts across all programs, so
 * we scope here: completion/stars to the program's authored activity ids, and
 * skill_state to the program's skills. This keeps a learner's progress in one
 * world from leaking into another (e.g. language skills out of the core map).
 *
 * Returns empty state when unauthenticated, on any failure, or for an unknown
 * program slug, so callers fall back to a fresh surface rather than a broken one.
 */
export async function getLearnerStateAction(
  learnerId: string,
  programSlug: string,
): Promise<LearnerStateResult> {
  if (!learnerId) return EMPTY_STATE;

  try {
    return await withAccount(async ({ accountId }) => {
      // Curation gate (Fix-F A1+A2): NO lazy auto-enroll-on-open. Opening a
      // program must not self-activate it. Read the enrollment status and fail
      // closed (no playable program) unless it is ACTIVE — so a removed/paused/
      // never-assigned program returns available:false and the kid surface shows
      // the calm "ask a grown-up" state (account mode). Default + parent-assigned
      // programs keep an active enrollment (ensureHouseholdLearner / assignProgram),
      // so legitimate play is unaffected. getEnrollmentForGate already enforces
      // tenancy (owned-by-account) and never resurrects a soft-removed row.
      const gate = await getEnrollmentForGate(accountId, learnerId, programSlug);
      if (gate?.status !== "active") return EMPTY_STATE;

      // Resolve the learner's PINNED program version (C#5). State scoping AND the
      // rendered tree both derive from this same resolved tree, so they always
      // agree on the version — and they match the /api/practice gate, which also
      // resolves via resolveLearnerProgram.
      const program = await resolveLearnerProgram(accountId, learnerId, programSlug);
      if (!program) return EMPTY_STATE;
      const activityIds = new Set(activityIdsForProgram(program));
      const skillTags = new Set(skillTagsForProgram(program));

      const [fullSkillState, completed, config, settings, generatedShelf, generatedCompletions] =
        await Promise.all([
          getSkillState(accountId, learnerId),
          getCompletedActivityIds(accountId, learnerId),
          getEnrollmentConfig(accountId, learnerId, programSlug),
          getLearnerSettings(accountId, learnerId),
          listGeneratedShelf(accountId, learnerId, programSlug),
          getGeneratedCompletions(accountId, learnerId),
        ]);

      // Scope skill_state to this program's skills.
      const skillState: SkillState = {};
      for (const [slug, record] of Object.entries(fullSkillState)) {
        if (skillTags.has(slug)) skillState[slug] = record;
      }

      // Scope completion + best-stars to this program's authored activities.
      const starsByActivity: Record<string, number> = {};
      const completedActivityIds: string[] = [];
      for (const c of completed) {
        if (!activityIds.has(c.activityId)) continue;
        completedActivityIds.push(c.activityId);
        starsByActivity[c.activityId] = c.stars;
      }

      // Durable shelf credit (B3): a played generated shelf item is a one-time,
      // trackable earner, so fold its completion + best stars in too — scoped to
      // THIS program's live shelf ids (shelfCompletions), so ephemeral in-session
      // "More" one-shots stay excluded and the reconcile can't wipe shelf credit
      // nor let nextGeneratedPick re-offer a played item. Shelf ids are UUIDs, a
      // disjoint namespace from authored ids, so there is no key collision.
      for (const c of shelfCompletions(generatedShelf, generatedCompletions)) {
        completedActivityIds.push(c.activityId);
        starsByActivity[c.activityId] = c.stars;
      }

      // Effective config: the per-learner Settings kill-switch (all-programs)
      // overrides the per-program flag, so the client hides "More, made just for
      // me" whenever EITHER level disables AI — matching the server gate, which
      // remains the authoritative enforcement.
      const effectiveConfig: LearnerSurfaceConfig = {
        ...config,
        ...(settings?.readAloud !== undefined ? { readAloud: settings.readAloud } : undefined),
        ...(settings?.aiPractice === false ? { aiPractice: false } : undefined),
      };

      return {
        skillState,
        completedActivityIds,
        starsByActivity,
        generatedShelf,
        config: effectiveConfig,
        program,
        available: true,
      };
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getLearnerStateAction failed", error);
    }
    return EMPTY_STATE;
  }
}

// ── Adaptive generation shelf (Adventure 2.0 B3) ─────────────────────────────

const ensureLessonPracticeSchema = z.object({
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  activityId: z.string().min(1).max(100).optional(),
  lessonId: z.string().min(1).max(100).optional(),
  more: z.boolean().optional(),
});

/** Locate the lesson (and its unit) to generate for: by explicit lessonId, else
 *  the lesson that contains activityId. Pure over the resolved tree. */
function locateLesson(
  program: Program,
  where: { lessonId?: string; activityId?: string },
): { unit: Unit; lesson: Lesson } | null {
  if (where.lessonId) {
    for (const unit of program.units) {
      const lesson = unit.lessons.find((l) => l.id === where.lessonId);
      if (lesson) return { unit, lesson };
    }
    return null;
  }
  if (where.activityId) {
    const ctx = findActivity(program, where.activityId);
    if (ctx) return { unit: ctx.unit, lesson: ctx.lesson };
  }
  return null;
}

/**
 * Eager, bounded, idempotent generation of a lesson's "fresh practice" shelf
 * (Adventure 2.0 B3 / spec §4). Called by the client after every completion; the
 * calm `{ ok: false, items: [] }` posture means an unauthenticated visitor or any
 * failure just yields no shelf (the surface falls back to authored content).
 *
 * Everything the model is steered by is SERVER-derived (§8): the band, focus, and
 * skill hints come from the resolved authored tree + the parent's enrollment
 * config — never from the client, which supplies only identifiers. The §8 gate
 * mirrors /api/practice exactly (owned learner, ACTIVE enrollment, and NEITHER
 * aiPractice kill-switch off), and generation is bounded (SHELF_BATCH per call,
 * SHELF_LESSON_CAP per lesson). A lesson only generates once its authored
 * activities are all complete (the completion witness), and re-calls are no-ops
 * unless `more` is set — so the shelf grows deliberately, never on every render.
 *
 * A baseline/mid/final CHECK-IN unit never grows a shelf (final review Critical):
 * its derivatives would carry the probe's real skill tags and, when played, fold
 * into skill_state (a shelf UUID resolves no checkpoint phase), silently changing
 * the learner's level from evidence whose own placement is parent-gated (C1). The
 * recount→generate→insert spend is also serialized per (learner, lesson) by an
 * advisory lock (withLessonGenerationLock), so concurrent completions can't each
 * burn an LLM batch (final review Fix 2).
 */
export async function ensureLessonPractice(
  input: z.infer<typeof ensureLessonPracticeSchema>,
): Promise<{ ok: boolean; items: ShelfItem[] }> {
  const parsed = ensureLessonPracticeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, items: [] };
  const { learnerId, programSlug, activityId, lessonId, more } = parsed.data;

  try {
    return await withAccount(async ({ accountId }): Promise<{ ok: boolean; items: ShelfItem[] }> => {
      // 1. §8 gate — mirrors /api/practice (fail-closed). Ownership first, then
      //    the resolved tree, then ACTIVE enrollment + BOTH aiPractice flags.
      const owned = await getLearner(accountId, learnerId);
      if (!owned) return { ok: false, items: [] };

      const program = await resolveLearnerProgram(accountId, learnerId, programSlug);
      if (!program) return { ok: false, items: [] };

      const [settings, gate] = await Promise.all([
        getLearnerSettings(accountId, learnerId),
        getEnrollmentForGate(accountId, learnerId, programSlug),
      ]);
      const aiOff =
        settings?.aiPractice === false ||
        !gate ||
        gate.status !== "active" ||
        gate.config.aiPractice === false;
      if (aiOff) return { ok: false, items: [] };

      // 2. Locate the lesson on the pinned tree (by lessonId, else the lesson
      //    containing activityId). Unknown → calm no-op.
      const located = locateLesson(program, { lessonId, activityId });
      if (!located) return { ok: false, items: [] };
      const { unit, lesson } = located;

      // 2a. Placement-integrity guard (final review Critical): a baseline/mid/final
      //    check-in unit must NEVER grow a shelf. Its authored attempts insert
      //    generated=false rows before the checkpoint branch, so the completion
      //    witness below would pass — but a derivative carries the probe's real
      //    skill tags and, when played, folds straight into skill_state (a shelf
      //    UUID resolves no checkpoint phase in recordAttemptAction), silently
      //    changing the learner's level from evidence whose placement is
      //    parent-gated (C1's core invariant). No-op calmly — `items` is [] because
      //    no checkpoint shelf can ever have been generated post-fix.
      if (unit.checkpoint) return { ok: true, items: [] };

      // The existing shelf for this lesson (needed by both the incomplete no-op
      // and the idempotency/cap returns below).
      const shelf = await listGeneratedShelf(accountId, learnerId, programSlug);
      const existing = shelf.filter((s) => s.lessonId === lesson.id);

      // 3. Completion witness: every AUTHORED activity in the lesson must be a
      //    (non-generated) completion. Incomplete → calm no-op returning existing
      //    (the client calls this after each completion, before the lesson is done).
      const completed = await getCompletedActivityIds(accountId, learnerId);
      const completedIds = new Set(completed.map((c) => c.activityId));
      const allComplete = lesson.activities.every((a) => completedIds.has(a.id));
      if (!allComplete) return { ok: true, items: existing };

      // 4. Idempotency + cap (cheap pre-check on the pre-lock read; re-verified
      //    race-safe under the advisory lock in withLessonGenerationLock below, so
      //    the common "already filled" case avoids opening a tx at all).
      if (!more && existing.length > 0) return { ok: true, items: existing };
      if (existing.length >= SHELF_LESSON_CAP) return { ok: true, items: existing };

      const band: Band = gate.config.band ?? "ready";
      const genAt = new Date();

      // 5. Claim the room BEFORE the LLM spend (final review Fix 2): the
      //    recount→generate→insert critical section is serialized per (learner,
      //    lesson) by a pg advisory xact lock, so N concurrent completions can't
      //    each burn an LLM batch — the losers see the winner's rows under the lock
      //    and return them without a model call. Everything the model is steered by
      //    stays SERVER-derived: the band, targets, and skill hints come from the
      //    authored tree + the parent's config. generatePracticeItems returns only
      //    validator-passing items and throws when zero survive — a throwing target
      //    is SKIPPED (a short batch is fine; authored content covers the rest).
      const items = await withLessonGenerationLock(
        accountId,
        learnerId,
        lesson.id,
        more ?? false,
        async (room): Promise<NewGeneratedActivity[]> => {
          const targets = pickGenerationTargets(lesson, room);
          if (targets.length === 0) return [];
          const newRows: NewGeneratedActivity[] = [];
          for (const target of targets) {
            try {
              const generated = await generatePracticeItems(target.kind, band, target.focus, target.n, {
                skillHints: target.skillTags,
              });
              for (const config of generated) {
                newRows.push({
                  programSlug,
                  unitKey: unit.id,
                  lessonId: lesson.id,
                  kind: target.kind,
                  title: `Fresh: ${target.sourceTitle}`,
                  config,
                  skillTags: target.skillTags,
                  // Mirror the generator's real route: World-Languages kinds use the
                  // per-language model, so stamp the lang-aware model, not just the band.
                  genModel: provenanceForGeneration(target.kind, band, target.skillTags).model,
                  genRoute: "shelf",
                  genAt,
                });
              }
            } catch (error) {
              captureNonCritical(`ensureLessonPractice: generation failed for kind=${target.kind}`, error);
            }
          }
          return newRows;
        },
      );
      return { ok: true, items };
    });
  } catch (error) {
    captureNonCritical("ensureLessonPractice failed", error);
    return { ok: false, items: [] };
  }
}
