"use server";

import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, requireAccount, withAccount } from "@/lib/tenancy";
import {
  ensureDefaultLearner,
  ensureEnrollment,
  getCompletedActivityIds,
  getEnrollmentConfig,
  getLearner,
  getSkillState,
  listEnrollmentsDetailed,
  recordAttempt,
} from "@/lib/tutor/store";
import type { EnrollmentConfig } from "@/lib/content/config";
import {
  activityIdsForProgram,
  skillTagsForProgram,
} from "@/content";
import { getProgramAsync, listProgramsAsync } from "@/lib/content/repository";
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

export type EnsureEnrollmentResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "invalid" | "error" };

/**
 * Lazily enroll a learner into a program the first time they open it. The slug
 * is validated against the program registry before any write, so an untrusted
 * URL slug can never create a bogus enrollment. Never throws to the client.
 */
export async function ensureEnrollmentAction(
  learnerId: string,
  programSlug: string,
): Promise<EnsureEnrollmentResult> {
  if (!learnerId) return { ok: false, reason: "invalid" };
  const known = (await listProgramsAsync()).some((p) => p.slug === programSlug);
  if (!known) return { ok: false, reason: "invalid" };
  try {
    await withAccount(async ({ accountId }) => {
      // Only enroll a learner the signed-in account actually owns (tenancy).
      const owned = await getLearner(accountId, learnerId);
      if (owned) await ensureEnrollment(learnerId, programSlug);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, reason: "unauthenticated" };
    captureNonCritical("ensureEnrollmentAction failed", error);
    return { ok: false, reason: "error" };
  }
}

const skillEvidenceSchema = z.object({
  skill: z.string().min(1).max(60),
  outcome: z.enum(["not_yet", "emerging", "solid"]),
});

const recordAttemptSchema = z.object({
  learnerId: z.string().min(1),
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
});

export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;

export type RecordResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "invalid" | "error" };

/**
 * Persist one completed activity (authored or AI-generated practice) and fold
 * its skill evidence into the learner's skill_state. The day is stamped from
 * the server clock so the mastery gate's "distinct days" rule is consistent.
 */
export async function recordAttemptAction(input: RecordAttemptInput): Promise<RecordResult> {
  const parsed = recordAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const data = parsed.data;

  try {
    await withAccount(({ accountId }) =>
      recordAttempt(accountId, {
        learnerId: data.learnerId,
        activityId: data.activityId,
        kind: data.kind,
        generated: data.generated ?? false,
        response: data.response,
        score: data.score,
        day: new Date().toISOString().slice(0, 10),
      }),
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, reason: "unauthenticated" };
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
}

const EMPTY_STATE: LearnerStateResult = {
  skillState: {},
  completedActivityIds: [],
  starsByActivity: {},
  config: {},
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
  const program = await getProgramAsync(programSlug);
  if (!program) return EMPTY_STATE;

  const activityIds = new Set(activityIdsForProgram(program));
  const skillTags = new Set(skillTagsForProgram(program));

  try {
    return await withAccount(async ({ accountId }) => {
      const [fullSkillState, completed, config] = await Promise.all([
        getSkillState(accountId, learnerId),
        getCompletedActivityIds(accountId, learnerId),
        getEnrollmentConfig(accountId, learnerId, programSlug),
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

      return { skillState, completedActivityIds, starsByActivity, config };
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getLearnerStateAction failed", error);
    }
    return EMPTY_STATE;
  }
}
