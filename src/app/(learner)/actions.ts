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
  getLearnerSettings,
  getSkillState,
  listEnrollmentsDetailed,
  recordAttempt,
} from "@/lib/tutor/store";
import type { EnrollmentConfig } from "@/lib/content/config";
import {
  activityIdsForProgram,
  skillTagsForProgram,
} from "@/content";
import type { Program } from "@/content";
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
 * top level) and NEVER throw to the client: an unauthenticated visitor or any
 * failure yields a calm empty/`ok:false` result the hook can fall back from.
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

export interface TutorSession {
  signedIn: boolean;
  learners: TutorLearner[];
}

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
      signedIn: true,
      learners: rows.map((r, i) => ({
        id: r.id,
        displayName: r.displayName,
        avatar: r.avatar ?? avatarFor(i),
        birthMonth: r.birthMonth,
      })),
    };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { signedIn: false, learners: [] };
    captureNonCritical("getTutorSession failed", error);
    return { signedIn: false, learners: [] };
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
    await withAccount(async ({ accountId }) => {
      // Quest-fold context (Adventure 2.0): locate the containing unit on the
      // learner's pinned tree, server-derived — never trusted from the client.
      // Unresolvable (unknown activity, resolver failure) degrades to
      // complete_n-only matching rather than failing the attempt write.
      let unitId: string | null = null;
      try {
        const program = await resolveLearnerProgram(accountId, data.learnerId, data.programSlug);
        if (program) unitId = findUnitIdOfActivity(program, data.activityId);
      } catch {
        unitId = null;
      }
      return recordAttempt(accountId, {
        learnerId: data.learnerId,
        programSlug: data.programSlug,
        activityId: data.activityId,
        kind: data.kind,
        generated,
        response: data.response,
        score: data.score,
        day: new Date().toISOString().slice(0, 10),
        provenance,
        unitId,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, reason: "unauthenticated" };
    if (error instanceof EnrollmentNotActiveError) return { ok: false, reason: "inactive" };
    captureNonCritical("recordAttemptAction failed", error);
    return { ok: false, reason: "error" };
  }
}

export interface LearnerStateResult {
  skillState: SkillState;
  /** Distinct authored activity ids the learner has completed. */
  completedActivityIds: string[];
  /** Best stars (0..3) per completed authored activity (for star glyphs). */
  starsByActivity: Record<string, number>;
  /** Per-child, per-program enrollment config set by the parent (empty object if none). */
  config: EnrollmentConfig;
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

      const [fullSkillState, completed, config, settings] = await Promise.all([
        getSkillState(accountId, learnerId),
        getCompletedActivityIds(accountId, learnerId),
        getEnrollmentConfig(accountId, learnerId, programSlug),
        getLearnerSettings(accountId, learnerId),
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

      // Effective config: the per-learner Settings kill-switch (all-programs)
      // overrides the per-program flag, so the client hides "More, made just for
      // me" whenever EITHER level disables AI — matching the server gate, which
      // remains the authoritative enforcement.
      const effectiveConfig: EnrollmentConfig =
        settings?.aiPractice === false ? { ...config, aiPractice: false } : config;

      return {
        skillState,
        completedActivityIds,
        starsByActivity,
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
