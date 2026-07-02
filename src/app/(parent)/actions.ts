"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { captureNonCritical } from "@/lib/capture";
import { getAuth } from "@/lib/auth";
import { UnauthenticatedError, withAccount } from "@/lib/tenancy";
import { mapActionError, parseInput } from "@/lib/actions/results";
import { findActivity, getSkill, type SkillTag } from "@/content";
import { getProgramAsync, listProgramsAsync } from "@/lib/content/repository";
import { getPublishedVersionId } from "@/lib/content/store";
import {
  assignProgram,
  buildAccountExport,
  buildLearnerExport,
  createLearner,
  deleteAccount,
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
import type { AccountExport } from "@/lib/tutor/account-export";
import { deriveOutcome, type SkillState } from "@/lib/tutor/mastery";
import {
  generateProgressReport,
  type ProgressReport,
  type ProgressReportSkill,
} from "@/lib/ai/report";
import { enrollmentConfigSchema, learnerSettingsSchema } from "@/lib/content/config";
import type { EnrollmentConfig } from "@/lib/content/config";
import { setOfferedInterests } from "@/lib/interests/store";
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
  const parsed = parseInput(createLearnerSchema, input, "Please check the form and try again.");
  if (!parsed.ok) return parsed;

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
    return mapActionError(
      error,
      "create learner failed",
      "We could not add the learner right now. Please try again in a moment.",
    );
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
      // A missing program is "not-found" (the slug doesn't resolve to a published
      // program), distinct from a transient DB error which keeps "unavailable".
      return { ok: false, reason: "not-found", message: "Program not found." };
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
    return mapActionError(error, "assignProgramAction failed", "Could not assign the program. Please try again.");
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
    return mapActionError(error, "removeProgramAction failed", "Could not remove the program. Please try again.");
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
    return mapActionError(error, "restoreProgramAction failed", "Could not restore the program. Please try again.");
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

  const configParsed = parseInput(enrollmentConfigSchema, config, "Invalid enrollment config.");
  if (!configParsed.ok) return configParsed;

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
    return mapActionError(error, "updateEnrollmentConfigAction failed", "Could not update the config. Please try again.");
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

  const settingsParsed = parseInput(learnerSettingsSchema, settings, "Invalid learner settings.");
  if (!settingsParsed.ok) return settingsParsed;

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
    return mapActionError(error, "saveLearnerSettingsAction failed", "Could not save settings. Please try again.");
  }
}

/* ── Interests (spec §4.3): parent-gated offered-set control ─────────────── */

const offeredInterestIdsSchema = z.array(z.string().min(1)).max(30);

/**
 * Replace the parent-OFFERED interest set for one learner. `setOfferedInterests`
 * also prunes any child pick that falls outside the new offered set, so a
 * removed interest can never linger as a stale pick (§8 subset invariant).
 */
export async function setOfferedInterestsAction(
  learnerId: string,
  interestIds: string[],
): Promise<EnrollmentActionResult> {
  const learnerIdParsed = z.string().min(1).safeParse(learnerId);
  if (!learnerIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid learner." };
  }

  const idsParsed = offeredInterestIdsSchema.safeParse(interestIds);
  if (!idsParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid interests." };
  }

  try {
    const saved = await withAccount(async ({ accountId }) => {
      return setOfferedInterests(accountId, learnerId, idsParsed.data);
    });

    if (!saved) {
      captureNonCritical(
        "setOfferedInterestsAction: learner not owned by account",
        new Error(`learner=${learnerId}`),
      );
      return { ok: false, reason: "not-found", message: "Learner not found." };
    }

    revalidateEnrollmentPaths(learnerId);
    return { ok: true };
  } catch (error) {
    return mapActionError(
      error,
      "setOfferedInterestsAction failed",
      "Could not save interests. Please try again.",
    );
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
    return mapActionError(error, "exportLearnerAction failed", "Could not export data. Please try again.");
  }
}

/** Discriminated result for exportAccountAction. */
export type ExportAccountResult =
  | { ok: true; data: AccountExport }
  | { ok: false; reason: "unauthenticated" | "unavailable"; message?: string };

/**
 * Build and return the WHOLE-ACCOUNT data export (P6 / spec §8 COPPA "export …
 * all its data"): the minimized parent record + every learner + a self-describing
 * data-inventory manifest. No args — the scope is the session. Like the per-child
 * export, the JSON is returned to the client, which triggers the browser download
 * (no server temp files). Account-scoped via withAccount; build-safe.
 */
export async function exportAccountAction(): Promise<ExportAccountResult> {
  try {
    const data = await withAccount(async ({ accountId }) => {
      // Stamp exportedAt here so the pure shaper stays free of new Date().
      return buildAccountExport(accountId, new Date().toISOString());
    });

    // null only if the parent user row vanished mid-request (e.g. concurrent
    // delete) — surface as a calm "unavailable", not a thrown stack.
    if (!data) {
      return { ok: false, reason: "unavailable", message: "Could not export data. Please try again." };
    }
    return { ok: true, data };
  } catch (error) {
    return mapActionError(error, "exportAccountAction failed", "Could not export data. Please try again.");
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
    return mapActionError(error, "deleteLearnerAction failed", "Could not delete the profile. Please try again.");
  }
}

/* ── Account-level delete (irreversible; re-auth gated, spec §8) ──────────── */

/** Discriminated result for deleteAccountAction. */
export type DeleteAccountActionResult =
  | { ok: true; summary: { deletedLearners: number; deletedAttempts: number } }
  | { ok: false; reason: "unauthenticated" | "reauth-failed" | "invalid" | "unavailable"; message?: string };

const deleteAccountSchema = z.object({
  /** The account password, re-verified through Better Auth before any delete. */
  password: z.string().min(1),
  /** A typed confirmation the client must send: the parent's own email. */
  confirmToken: z.string().min(1),
});

/**
 * HARD-DELETE the whole account (spec §8 "delete … all its data"): the parent
 * user + every learner (enrollment/attempt/skill_state) + sessions + Better Auth
 * credential rows, via the FK cascade off `deleteAccount`. Irreversible.
 *
 * Re-auth gate (approved decision): BOTH must pass BEFORE anything is deleted, or
 * the action returns `reason:"reauth-failed"` and NOTHING is touched:
 *   1. The typed `confirmToken` must equal the signed-in parent's own email
 *      (defense against fat-finger + CSRF-style replay; the action is already
 *      same-origin via Better Auth).
 *   2. The `password` is re-verified through Better Auth's `verifyPassword`
 *      endpoint — a purpose-built, zero-side-effect check that compares against
 *      the stored credential hash for THIS session's user and throws an APIError
 *      on mismatch. We never hand-roll password comparison, and verifyPassword
 *      creates/rotates NO session (unlike signIn).
 *
 * On success the session is invalidated (signOut clears the cookie; the session
 * row itself already cascaded) and a summary is returned; the client redirects
 * to the public /goodbye page.
 */
export async function deleteAccountAction(input: {
  password: string;
  confirmToken: string;
}): Promise<DeleteAccountActionResult> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "Please confirm your email and password." };
  }
  const { password, confirmToken } = parsed.data;

  try {
    const auth = getAuth();
    const requestHeaders = await headers();

    // Resolve the session FIRST — both the email check and the password
    // re-verification are scoped to the signed-in user (verifyPassword reads the
    // user from these headers; the email is checked against the session user).
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user) {
      return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
    }

    // (1) Typed confirmation — the parent must type their OWN email. Compared
    // trimmed + case-insensitively (emails are case-insensitive in practice).
    const emailMatches =
      confirmToken.trim().toLowerCase() === session.user.email.trim().toLowerCase();
    if (!emailMatches) {
      // Re-auth failed → NOTHING is deleted.
      return {
        ok: false,
        reason: "reauth-failed",
        message: "That didn't match. Type your account email and password to confirm.",
      };
    }

    // (2) Re-verify the password via Better Auth (throws APIError on mismatch;
    // no session is created/rotated). This runs BEFORE any delete.
    try {
      await auth.api.verifyPassword({ body: { password }, headers: requestHeaders });
    } catch (error) {
      if (isAPIError(error)) {
        // Wrong password → re-auth failed, NOTHING is deleted.
        return {
          ok: false,
          reason: "reauth-failed",
          message: "That didn't match. Type your account email and password to confirm.",
        };
      }
      throw error; // unexpected — fall through to the generic handler
    }

    // Both gates passed → perform the irreversible delete (audit row written
    // first, inside the same transaction; see deleteAccount).
    const result = await withAccount(({ accountId }) => deleteAccount(accountId));

    // Invalidate the session cookie. The session ROW already cascaded with the
    // user delete; this clears the client cookie so the redirect lands signed-out.
    // Best-effort: a failure here must not turn a successful delete into an error.
    try {
      await auth.api.signOut({ headers: requestHeaders });
    } catch (error) {
      captureNonCritical("signOut after account delete failed (non-fatal)", error);
    }

    return {
      ok: true,
      summary: { deletedLearners: result.deletedLearners, deletedAttempts: result.deletedAttempts },
    };
  } catch (error) {
    return mapActionError(error, "deleteAccountAction failed", "Could not delete your account. Please try again.");
  }
}
