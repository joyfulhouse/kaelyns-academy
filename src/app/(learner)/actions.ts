"use server";

import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, requireAccount, withAccount } from "@/lib/tenancy";
import {
  CompletionReplayMismatchError,
  EnrollmentNotActiveError,
  EnrollmentVersionChangedError,
  GeneratedActivityAlreadyCompletedError,
  ensureDefaultLearner,
  ensureEnrollment,
  getCompletedActivityIds,
  getCompletedActivityIdsForVersion,
  getDueReviews,
  getEnrollmentForGate,
  getGeneratedActivity,
  getPlayableGeneratedActivity,
  getGeneratedCompletions,
  getLearner,
  getLearnerSettings,
  getSkillState,
  listEnrollmentsDetailed,
  listGeneratedShelf,
  recordAttempt,
  withLessonGenerationLock,
  type NewGeneratedActivity,
  type DueReview,
  type ShelfItem,
  type PlayableShelfItem,
} from "@/lib/tutor/store";
import {
  isEnrollmentUnitActive,
  type EnrollmentConfig,
  type LearnerSurfaceConfig,
} from "@/lib/content/config";
import {
  activityIdsForProgram,
  findActivity,
  getUnit,
  skillTagsForProgram,
} from "@/content";
import type { ActivityScore, Band, Lesson, Program, Unit } from "@/content";
import { parseAndScoreActivity } from "@/activities/server-verification";
import { getServerAttemptVerifier } from "@/activities/server-attempt-verifiers";
import { generatePracticeItems, provenanceForGeneration } from "@/lib/ai/practice";
import {
  pickGenerationTargets,
  shelfCompletions,
  SHELF_LESSON_CAP,
} from "@/lib/tutor/shelf";
import { resolveProgramForEnrollmentVersion } from "@/lib/content/repository";
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

const generatedPracticeLookupSchema = z.object({
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  generatedId: z.string().min(1).max(100),
});

export type GeneratedPracticeLookup = z.infer<typeof generatedPracticeLookupSchema>;

/** A generated row remains playable only while its authored shelf location is
 * present in the learner's resolved program tree. Lesson keys are unit-local. */
function programContainsGeneratedLocation(
  program: Program,
  row: { unitKey: string; lessonId: string },
): boolean {
  return getUnit(program, row.unitKey)?.lessons.some((lesson) => lesson.id === row.lessonId) ?? false;
}

/**
 * Resolve one generated shelf item only after the client has resolved its
 * selected account learner. The store repeats both account tenancy and learner
 * scoping, so siblings under one household cannot open each other's practice.
 */
export async function getGeneratedPracticeAction(
  input: GeneratedPracticeLookup,
): Promise<PlayableShelfItem | null> {
  const parsed = generatedPracticeLookupSchema.safeParse(input);
  if (!parsed.success) return null;

  try {
    return await withAccount(async ({ accountId }) => {
      const gate = await getEnrollmentForGate(
        accountId,
        parsed.data.learnerId,
        parsed.data.programSlug,
      );
      if (
        gate?.status !== "active" ||
        !gate.configValid ||
        !gate.programVersionId
      ) {
        return null;
      }
      const program = await resolveProgramForEnrollmentVersion(
        parsed.data.programSlug,
        gate.programVersionId,
      );
      if (!program) return null;
      const row = await getPlayableGeneratedActivity(
        accountId,
        parsed.data.learnerId,
        parsed.data.programSlug,
        gate.programVersionId,
        parsed.data.generatedId,
      );
      return row && programContainsGeneratedLocation(program, row) ? row : null;
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getGeneratedPracticeAction failed", error);
    }
    return null;
  }
}

const recordAttemptIdentitySchema = z.object({
  learnerId: z.string().min(1),
  programSlug: z.string().min(1),
  completionId: z.string().uuid(),
  response: z.unknown(),
  /** Reserved for a kind-specific, server-stored verification result. Ordinary
   * deterministic plugins reject it; oral reading is the first planned user. */
  verificationId: z.string().uuid().optional(),
});

const recordAttemptSchema = z.union([
  recordAttemptIdentitySchema.extend({
    unitKey: z.string().min(1).max(100),
    activityId: z.string().min(1).max(100),
  }),
  recordAttemptIdentitySchema.extend({
    generatedActivityId: z.string().min(1).max(100),
  }),
]);

export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;

export type RecordResult =
  | { ok: true; score: ActivityScore }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "invalid"
        | "inactive"
        | "unavailable"
        | "completed"
        | "error";
    };

/**
 * Persist one completed activity using identifiers plus bounded response facts.
 * The browser is never authoritative for kind, config, score, evidence, unit,
 * generated status, or generation provenance. Authored attempts resolve inside
 * the exact route unit of the learner's pinned program; generated attempts
 * resolve a shelf row owned by that learner. Config and response are parsed and
 * scored through the server-only plugin registry before the store sees them.
 */
export async function recordAttemptAction(input: RecordAttemptInput): Promise<RecordResult> {
  const parsed = recordAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const data = parsed.data;

  try {
    return await withAccount(async ({ accountId }): Promise<RecordResult> => {
      const gate = await getEnrollmentForGate(
        accountId,
        data.learnerId,
        data.programSlug,
      );
      if (!gate || gate.status !== "active" || !gate.configValid) {
        return { ok: false, reason: "inactive" };
      }
      if ("unitKey" in data && !isEnrollmentUnitActive(gate.config, data.unitKey)) {
        return { ok: false, reason: "inactive" };
      }
      if ("generatedActivityId" in data && !gate.programVersionId) {
        return { ok: false, reason: "unavailable" };
      }

      let program: Program | null;
      try {
        program =
          (await resolveProgramForEnrollmentVersion(
            data.programSlug,
            gate.programVersionId,
          )) ?? null;
      } catch (error) {
        captureNonCritical("recordAttemptAction pinned program unavailable", error);
        return { ok: false, reason: "unavailable" };
      }
      if (!program) return { ok: false, reason: "unavailable" };

      if ("generatedActivityId" in data) {
        const programVersionId = gate.programVersionId;
        if (!programVersionId) return { ok: false, reason: "unavailable" };
        const row = await getGeneratedActivity(
          accountId,
          data.learnerId,
          data.programSlug,
          programVersionId,
          data.generatedActivityId,
        );
        if (
          !row ||
          row.programSlug !== data.programSlug ||
          !programContainsGeneratedLocation(program, row)
        ) {
          return { ok: false, reason: "invalid" };
        }
        if (!isEnrollmentUnitActive(gate.config, row.unitKey)) {
          return { ok: false, reason: "inactive" };
        }
        // Oral verification is bound to an exact pinned authored activity.
        // Generated shelf rows never enter that trust path, and no generated
        // kind may interpret a verification id.
        if (row.kind === "oral-reading" || data.verificationId) {
          return { ok: false, reason: "invalid" };
        }
        const canonical = parseAndScoreActivity(
          row.kind,
          row.config,
          data.response,
          row.skillTags,
        );
        if (!canonical.ok) return { ok: false, reason: "invalid" };

        const provenance = row.gen
          ? {
              model: row.gen.model,
              route: row.gen.route,
              at: new Date(row.gen.at),
            }
          : undefined;
        const score = await recordAttempt(accountId, {
          learnerId: data.learnerId,
          programSlug: data.programSlug,
          expectedProgramVersionId: gate.programVersionId,
          completionId: data.completionId,
          activityId: row.id,
          kind: row.kind,
          generated: true,
          response: canonical.response,
          score: canonical.score,
          day: new Date().toISOString().slice(0, 10),
          provenance,
          unitId: row.unitKey,
          creditEligible: false,
          shelfEligible: true,
          checkpointPhase: null,
        });
        return { ok: true, score };
      }

      const unit = getUnit(program, data.unitKey);
      const activity = unit?.lessons
        .flatMap((lesson) => lesson.activities)
        .find((candidate) => candidate.id === data.activityId);
      if (!unit || !activity) return { ok: false, reason: "invalid" };

      const verifier = getServerAttemptVerifier(activity.kind);
      if (verifier) {
        const score = await verifier({
          accountId,
          learnerId: data.learnerId,
          programSlug: data.programSlug,
          expectedProgramVersionId: gate.programVersionId,
          completionId: data.completionId,
          unitKey: unit.id,
          activityId: activity.id,
          verificationId: data.verificationId,
          rawConfig: activity.config,
          allowedSkillTags: activity.skillTags,
          day: new Date().toISOString().slice(0, 10),
          checkpointPhase: unit.checkpoint ?? null,
        });
        return score ? { ok: true, score } : { ok: false, reason: "invalid" };
      }
      // Opaque witnesses have no generic meaning. Ordinary deterministic kinds
      // reject them instead of silently ignoring them.
      if (data.verificationId) return { ok: false, reason: "invalid" };

      const canonical = parseAndScoreActivity(
        activity.kind,
        activity.config,
        data.response,
        activity.skillTags,
      );
      if (!canonical.ok) return { ok: false, reason: "invalid" };

      const score = await recordAttempt(accountId, {
        learnerId: data.learnerId,
        programSlug: data.programSlug,
        expectedProgramVersionId: gate.programVersionId,
        completionId: data.completionId,
        activityId: activity.id,
        kind: activity.kind,
        generated: false,
        response: canonical.response,
        score: canonical.score,
        day: new Date().toISOString().slice(0, 10),
        unitId: unit.id,
        creditEligible: true,
        shelfEligible: false,
        checkpointPhase: unit.checkpoint ?? null,
      });
      return { ok: true, score };
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, reason: "unauthenticated" };
    if (error instanceof CompletionReplayMismatchError) {
      return { ok: false, reason: "invalid" };
    }
    if (error instanceof EnrollmentNotActiveError) return { ok: false, reason: "inactive" };
    if (error instanceof EnrollmentVersionChangedError) {
      return { ok: false, reason: "unavailable" };
    }
    if (error instanceof GeneratedActivityAlreadyCompletedError) {
      return { ok: false, reason: "completed" };
    }
    captureNonCritical("recordAttemptAction failed", error);
    return { ok: false, reason: "error" };
  }
}

export interface LearnerStateResult {
  /** Operational failures are non-publishable; legitimate empty states are ok. */
  status: "ok" | "error";
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
  /** Due authored activities for the low-pressure Warm-up row, most overdue first. */
  dueReviews: DueReview[];
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
  /** Exact enrollment version captured for this state snapshot. */
  programVersionId: string | null;
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
  status: "ok",
  skillState: {},
  completedActivityIds: [],
  starsByActivity: {},
  generatedShelf: [],
  dueReviews: [],
  config: {},
  program: null,
  programVersionId: null,
  available: false,
};

const ERROR_STATE: LearnerStateResult = { ...EMPTY_STATE, status: "error" };

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
      if (gate?.status !== "active" || !gate.configValid) return EMPTY_STATE;

      // Resolve the learner's PINNED program version (C#5). State scoping AND the
      // rendered tree both derive from this same resolved tree, so they always
      // agree on the version — and they match the durable shelf-generation gate.
      const program = await resolveProgramForEnrollmentVersion(
        programSlug,
        gate.programVersionId,
      );
      if (!program) return EMPTY_STATE;
      const activityIds = new Set(activityIdsForProgram(program));
      const skillTags = new Set(skillTagsForProgram(program));
      const today = new Date().toISOString().slice(0, 10);

      const [
        fullSkillState,
        completed,
        settings,
        generatedShelf,
        generatedCompletions,
        dueReviews,
      ] =
        await Promise.all([
          getSkillState(accountId, learnerId),
          getCompletedActivityIds(accountId, learnerId),
          getLearnerSettings(accountId, learnerId),
          gate.programVersionId
            ? listGeneratedShelf(accountId, learnerId, programSlug, gate.programVersionId)
            : Promise.resolve([]),
          getGeneratedCompletions(accountId, learnerId),
          getDueReviews(
            accountId,
            learnerId,
            program,
            gate.programVersionId,
            today,
          ),
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
        ...gate.config,
        ...(settings?.readAloud !== undefined ? { readAloud: settings.readAloud } : undefined),
        ...(settings?.oralReading !== undefined
          ? { oralReading: settings.oralReading }
          : undefined),
        ...(settings?.aiPractice === false ? { aiPractice: false } : undefined),
      };

      return {
        status: "ok",
        skillState,
        completedActivityIds,
        starsByActivity,
        generatedShelf,
        dueReviews,
        config: effectiveConfig,
        program,
        programVersionId: gate.programVersionId,
        available: true,
      };
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getLearnerStateAction failed", error);
    }
    return ERROR_STATE;
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
 * requires an owned learner, ACTIVE enrollment, and NEITHER
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
      // 1. §8 gate (fail-closed). Ownership first, then
      //    the resolved tree, then ACTIVE enrollment + BOTH aiPractice flags.
      const owned = await getLearner(accountId, learnerId);
      if (!owned) return { ok: false, items: [] };

      const [settings, gate] = await Promise.all([
        getLearnerSettings(accountId, learnerId),
        getEnrollmentForGate(accountId, learnerId, programSlug),
      ]);
      if (
        settings?.aiPractice === false ||
        !gate ||
        gate.status !== "active" ||
        !gate.configValid ||
        gate.config.aiPractice === false ||
        !gate.programVersionId
      ) {
        return { ok: false, items: [] };
      }
      const programVersionId = gate.programVersionId;
      const program = await resolveProgramForEnrollmentVersion(programSlug, programVersionId);
      if (!program) return { ok: false, items: [] };

      // 2. Locate the lesson on the pinned tree (by lessonId, else the lesson
      //    containing activityId). Unknown → calm no-op.
      const located = locateLesson(program, { lessonId, activityId });
      if (!located) return { ok: false, items: [] };
      const { unit, lesson } = located;
      if (!isEnrollmentUnitActive(gate.config, unit.id)) {
        return { ok: false, items: [] };
      }

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
      const shelf = await listGeneratedShelf(
        accountId,
        learnerId,
        programSlug,
        programVersionId,
      );
      const existing = shelf.filter(
        (s) => s.unitKey === unit.id && s.lessonId === lesson.id,
      );

      // 3. Completion witness: every AUTHORED activity in the lesson must be a
      //    (non-generated) completion. Incomplete → calm no-op returning existing
      //    (the client calls this after each completion, before the lesson is done).
      const completed = await getCompletedActivityIdsForVersion(
        accountId,
        learnerId,
        programSlug,
        programVersionId,
      );
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
        { programSlug, programVersionId, unitKey: unit.id, lessonId: lesson.id },
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
