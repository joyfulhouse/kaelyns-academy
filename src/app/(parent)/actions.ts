"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, withAccount } from "@/lib/tenancy";
import { findActivity, getProgram, getSkill, type SkillTag } from "@/content";
import {
  createLearner,
  ensureEnrollment,
  getRecentAttempts,
  getSkillState,
  listLearners,
  type LearnerRow,
} from "@/lib/tutor/store";
import { deriveOutcome, type SkillState } from "@/lib/tutor/mastery";
import {
  generateProgressReport,
  type ProgressReport,
  type ProgressReportSkill,
} from "@/lib/ai/report";
import { ADAPTIVE_PROGRAM_SLUG, kindLabel } from "./data";

/**
 * Parent-gated server actions for the parent surface. Every one runs inside
 * `withAccount` (the tenancy seam), which resolves the Better Auth session
 * per-request and scopes all reads/writes to the signed-in account, so a parent
 * can only ever touch their own learners. Build-safe: `withAccount` is the only
 * thing that touches auth/DB and it is invoked per-call, never at module top
 * level.
 */

/* ── Create a child profile ──────────────────────────────────────────────── */

/** Birth month as a 1..12 string from the <select>; optional. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const createLearnerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Please enter a name.")
    .max(40, "That name is a little long; please shorten it."),
  // A select of month names, or "" for "prefer not to say".
  birthMonth: z
    .union([z.enum(MONTHS), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/** Discriminated result so the form renders calm states, never a thrown stack. */
export type CreateLearnerResult =
  | { ok: true; learner: LearnerRow }
  | { ok: false; reason: "unauthenticated" | "invalid" | "unavailable"; message: string };

/**
 * Create a learner for the current account and enroll them in the adaptive
 * program. Validates input, scopes the write via withAccount, and revalidates
 * the parent surfaces so the new learner appears immediately.
 */
export async function createLearnerAction(input: {
  displayName: string;
  birthMonth?: string;
}): Promise<CreateLearnerResult> {
  const parsed = createLearnerSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the form and try again.";
    return { ok: false, reason: "invalid", message };
  }

  try {
    const learner = await withAccount(async ({ accountId }) => {
      const created = await createLearner(accountId, {
        displayName: parsed.data.displayName,
        birthMonth: parsed.data.birthMonth,
      });
      await ensureEnrollment(created.id, ADAPTIVE_PROGRAM_SLUG);
      return created;
    });

    revalidatePath("/parent");
    revalidatePath("/parent/learners");
    return { ok: true, learner };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("create learner failed", error);
    return {
      ok: false,
      reason: "unavailable",
      message: "We could not add the learner right now. Please try again in a moment.",
    };
  }
}

/* ── AI weekly progress report (on real data) ────────────────────────────── */

/**
 * Discriminated result so the client renders calm states, never a thrown stack.
 *  - ok+report: a generated narrative grounded in this learner's real data.
 *  - empty: the learner has no attempts yet; we do NOT call the model, we invite.
 *  - unauthenticated / unavailable: gate + graceful AI-failure fallbacks.
 */
export type ProgressReportResult =
  | { ok: true; report: ProgressReport; learnerName: string }
  | { ok: false; reason: "empty"; learnerName: string }
  | { ok: false; reason: "unauthenticated" | "no-learner" | "unavailable" };

/** Map a learner's DB skill_state to the labelled shape the report grounds on. */
function buildReportSkills(state: SkillState): ProgressReportSkill[] {
  const skills: ProgressReportSkill[] = [];
  for (const [slug, record] of Object.entries(state) as [SkillTag, SkillState[SkillTag]][]) {
    if (!record || record.history.length === 0) continue;
    const skill = getSkill(slug);
    if (!skill) continue;
    skills.push({ label: skill.label, domain: skill.domain, outcome: deriveOutcome(record) });
  }
  return skills;
}

/**
 * Generate the AI weekly progress report for one learner (defaults to the
 * account's first learner) grounded STRICTLY in their real skill_state + recent
 * attempts. If the learner has no activity yet, return a friendly "empty"
 * result instead of inventing progress (assessment.md §3 / child-data posture).
 * Account-scoped via withAccount; build-safe (no top-level auth/DB).
 */
export async function requestProgressReport(learnerId?: string): Promise<ProgressReportResult> {
  let resolved:
    | { learner: LearnerRow; state: SkillState; recent: { title: string; stars: number }[] }
    | { empty: true; learnerName: string }
    | { noLearner: true };

  try {
    resolved = await withAccount(async ({ accountId }) => {
      const learners = await listLearners(accountId);
      const learner = learnerId
        ? learners.find((l) => l.id === learnerId)
        : learners[0];
      if (!learner) return { noLearner: true } as const;

      const [state, attempts] = await Promise.all([
        getSkillState(accountId, learner.id),
        getRecentAttempts(accountId, learner.id, 8),
      ]);

      if (attempts.length === 0) {
        return { empty: true, learnerName: learner.displayName } as const;
      }

      // Ground the report's recent list in the real activity titles where we
      // can resolve them (falling back to the plain-language kind label).
      const program = getProgram(ADAPTIVE_PROGRAM_SLUG);
      return {
        learner,
        state,
        recent: attempts.map((a) => {
          const found = program ? findActivity(program, a.activityId) : undefined;
          return { title: found?.activity.title ?? kindLabel(a.kind), stars: a.stars };
        }),
      };
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, reason: "unauthenticated" };
    captureNonCritical("parent progress report read failed", error);
    return { ok: false, reason: "unavailable" };
  }

  if ("noLearner" in resolved) return { ok: false, reason: "no-learner" };
  if ("empty" in resolved) return { ok: false, reason: "empty", learnerName: resolved.learnerName };

  const input = {
    learnerName: resolved.learner.displayName,
    skills: buildReportSkills(resolved.state),
    recent: resolved.recent,
  };

  try {
    const report = await generateProgressReport(input);
    return { ok: true, report, learnerName: resolved.learner.displayName };
  } catch (error) {
    // The AI gateway/validation failed. Log non-critically and tell the client
    // it is unavailable; we never leak raw model output or a stack to the UI.
    captureNonCritical("parent progress report generation failed", error);
    return { ok: false, reason: "unavailable" };
  }
}
