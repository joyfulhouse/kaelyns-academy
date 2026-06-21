"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, withAccount } from "@/lib/tenancy";
import { findActivity, getSkill, type SkillTag } from "@/content";
import { getProgramAsync, listProgramsAsync } from "@/lib/content/repository";
import { getPublishedVersionId } from "@/lib/content/store";
import {
  assignProgram,
  buildLearnerExport,
  createLearner,
  deleteLearner,
  ensureEnrollment,
  getRecentAttempts,
  getSkillState,
  listLearners,
  saveLearnerSettings,
  setEnrollmentConfig,
  setEnrollmentStatus,
  type LearnerRow,
} from "@/lib/tutor/store";
import type { LearnerExport } from "@/lib/tutor/export";
import { deriveOutcome, type SkillState } from "@/lib/tutor/mastery";
import {
  generateProgressReport,
  type ProgressReport,
  type ProgressReportSkill,
} from "@/lib/ai/report";
import { enrollmentConfigSchema, learnerSettingsSchema } from "@/lib/content/config";
import type { EnrollmentConfig } from "@/lib/content/config";
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
      const program = await getProgramAsync(ADAPTIVE_PROGRAM_SLUG);
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

/* ── Enrollment lifecycle + config + settings ────────────────────────────── */

/** Shared revalidation targets for all enrollment mutations. */
function revalidateEnrollmentPaths(learnerId: string): void {
  revalidatePath("/parent");
  revalidatePath("/parent/learners");
  revalidatePath(`/parent/learners/${learnerId}`);
}

/** Shared discriminated result for enrollment actions. */
type EnrollmentActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthenticated" | "invalid" | "not-found" | "unavailable";
      message: string;
    };

/**
 * Assign (or restore) a published program to a learner. Validates the slug
 * against the live program catalog and pins the current published version id.
 */
export async function assignProgramAction(
  learnerId: string,
  slug: string,
): Promise<EnrollmentActionResult> {
  const slugParsed = z.string().min(1).safeParse(slug);
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  if (!slugParsed.success || !learnerIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid learner or program." };
  }

  try {
    const programs = await listProgramsAsync();
    const exists = programs.some((p) => p.slug === slug);
    if (!exists) {
      return { ok: false, reason: "unavailable", message: "Program not found." };
    }

    const programVersionId = await getPublishedVersionId(slug);

    const assigned = await withAccount(async ({ accountId }) => {
      return assignProgram(accountId, learnerId, slug, programVersionId);
    });

    if (!assigned) {
      captureNonCritical(
        "assignProgramAction: learner not owned by account",
        new Error(`learner=${learnerId} slug=${slug}`),
      );
      return { ok: false, reason: "not-found", message: "Learner not found." };
    }

    revalidateEnrollmentPaths(learnerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("assignProgramAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not assign the program. Please try again." };
  }
}

/**
 * Soft-remove a program from a learner's enrollment (sets status="removed").
 */
export async function removeProgramAction(
  learnerId: string,
  slug: string,
): Promise<EnrollmentActionResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  const slugParsed = z.string().min(1).safeParse(slug);
  if (!learnerIdParsed.success || !slugParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid learner or program." };
  }

  try {
    const updated = await withAccount(async ({ accountId }) => {
      return setEnrollmentStatus(accountId, learnerId, slug, "removed");
    });

    if (!updated) {
      captureNonCritical(
        "removeProgramAction: no enrollment updated (not owned, missing, or disallowed transition)",
        new Error(`learner=${learnerId} slug=${slug}`),
      );
      return { ok: false, reason: "not-found", message: "Enrollment not found." };
    }

    revalidateEnrollmentPaths(learnerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("removeProgramAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not remove the program. Please try again." };
  }
}

/**
 * Restore a previously removed program enrollment (sets status="active").
 */
export async function restoreProgramAction(
  learnerId: string,
  slug: string,
): Promise<EnrollmentActionResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  const slugParsed = z.string().min(1).safeParse(slug);
  if (!learnerIdParsed.success || !slugParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid learner or program." };
  }

  try {
    const updated = await withAccount(async ({ accountId }) => {
      return setEnrollmentStatus(accountId, learnerId, slug, "active");
    });

    if (!updated) {
      captureNonCritical(
        "restoreProgramAction: no enrollment updated (not owned, missing, or disallowed transition)",
        new Error(`learner=${learnerId} slug=${slug}`),
      );
      return { ok: false, reason: "not-found", message: "Enrollment not found." };
    }

    revalidateEnrollmentPaths(learnerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("restoreProgramAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not restore the program. Please try again." };
  }
}

/**
 * Update per-enrollment config (band, activeUnitKeys, aiPractice, dailyGoal).
 * Parses the incoming `config` with enrollmentConfigSchema before persisting.
 */
export async function updateEnrollmentConfigAction(
  learnerId: string,
  slug: string,
  config: unknown,
): Promise<EnrollmentActionResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  const slugParsed = z.string().min(1).safeParse(slug);
  if (!learnerIdParsed.success || !slugParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid learner or program." };
  }

  const configParsed = enrollmentConfigSchema.safeParse(config);
  if (!configParsed.success) {
    const message = configParsed.error.issues[0]?.message ?? "Invalid enrollment config.";
    return { ok: false, reason: "invalid", message };
  }

  // Normalize: an empty activeUnitKeys array means "all units active", which is
  // the same as the field being absent. Store it as omitted so the DB never drifts
  // from that intent regardless of what the client sent.
  const normalized: EnrollmentConfig = {
    ...configParsed.data,
    ...(configParsed.data.activeUnitKeys?.length === 0
      ? { activeUnitKeys: undefined }
      : undefined),
  };

  try {
    const updated = await withAccount(async ({ accountId }) => {
      return setEnrollmentConfig(accountId, learnerId, slug, normalized);
    });

    if (!updated) {
      captureNonCritical(
        "updateEnrollmentConfigAction: no enrollment updated (not owned or missing)",
        new Error(`learner=${learnerId} slug=${slug}`),
      );
      return { ok: false, reason: "not-found", message: "Enrollment not found." };
    }

    revalidateEnrollmentPaths(learnerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("updateEnrollmentConfigAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not update the config. Please try again." };
  }
}

/**
 * Persist learner-level settings (dailyGoal, aiPractice, readAloud).
 * Parses the incoming `settings` with learnerSettingsSchema before persisting.
 */
export async function saveLearnerSettingsAction(
  learnerId: string,
  settings: unknown,
): Promise<EnrollmentActionResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  if (!learnerIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid learner." };
  }

  const settingsParsed = learnerSettingsSchema.safeParse(settings);
  if (!settingsParsed.success) {
    const message = settingsParsed.error.issues[0]?.message ?? "Invalid learner settings.";
    return { ok: false, reason: "invalid", message };
  }

  try {
    // settingsParsed.data is already LearnerSettings (inferred from the Zod
    // schema) — no cast, so a schema/type drift surfaces as a type error here.
    const saved = await withAccount(async ({ accountId }) => {
      return saveLearnerSettings(accountId, learnerId, settingsParsed.data);
    });

    if (!saved) {
      captureNonCritical(
        "saveLearnerSettingsAction: learner not owned by account",
        new Error(`learner=${learnerId}`),
      );
      return { ok: false, reason: "not-found", message: "Learner not found." };
    }

    revalidateEnrollmentPaths(learnerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("saveLearnerSettingsAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not save settings. Please try again." };
  }
}

/* ── Per-child data export + profile delete (spec §8 COPPA controls) ─────── */

/** Discriminated result for exportLearnerAction. */
export type ExportLearnerResult =
  | { ok: true; data: LearnerExport }
  | { ok: false; reason: "unauthenticated" | "not-found" | "unavailable"; message?: string };

/**
 * Build and return the minimized per-child data export (spec §8). The
 * resulting JSON is sent back to the client; the client is responsible for
 * triggering the browser download (no temp files server-side).
 */
export async function exportLearnerAction(learnerId: string): Promise<ExportLearnerResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  if (!learnerIdParsed.success) {
    return { ok: false, reason: "not-found", message: "Learner not found." };
  }

  try {
    const data = await withAccount(async ({ accountId }) => {
      // Stamp exportedAt here so the pure shaper stays free of new Date().
      return buildLearnerExport(accountId, learnerId, new Date().toISOString());
    });

    if (!data) return { ok: false, reason: "not-found", message: "Learner not found." };
    return { ok: true, data };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("exportLearnerAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not export data. Please try again." };
  }
}

/** Discriminated result for deleteLearnerAction. */
export type DeleteLearnerResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "not-found" | "unavailable"; message?: string };

/**
 * Delete a child profile and all its data (enrollment/attempt/skill_state via
 * FK cascade). Revalidates the parent surfaces on success so the deleted learner
 * disappears immediately.
 */
export async function deleteLearnerAction(learnerId: string): Promise<DeleteLearnerResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  if (!learnerIdParsed.success) {
    return { ok: false, reason: "not-found", message: "Learner not found." };
  }

  try {
    const deleted = await withAccount(async ({ accountId }) => {
      return deleteLearner(accountId, learnerId);
    });

    if (!deleted) return { ok: false, reason: "not-found", message: "Learner not found." };

    revalidatePath("/parent");
    revalidatePath("/parent/learners");
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }
    captureNonCritical("deleteLearnerAction failed", error);
    return { ok: false, reason: "unavailable", message: "Could not delete the profile. Please try again." };
  }
}
