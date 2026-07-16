import { z } from "zod";
export const enrollmentConfigSchema = z.object({
  band: z.enum(["ready", "stretch"]).optional(),
  activeUnitKeys: z.array(z.string().min(1)).optional(),
  aiPractice: z.boolean().optional(),
  dailyGoal: z.number().int().min(0).max(50).optional(),
});
export type EnrollmentConfig = z.infer<typeof enrollmentConfigSchema>;

/**
 * Parent curation semantics shared by learner rendering and server write gates.
 * An omitted or empty list means the whole enrolled program is active; once a
 * parent chooses a non-empty list, the exact route unit must be present.
 */
export function isEnrollmentUnitActive(
  config: EnrollmentConfig,
  unitKey: string | undefined,
): boolean {
  const active = config.activeUnitKeys;
  return !active || active.length === 0 ? true : unitKey !== undefined && active.includes(unitKey);
}

export const learnerSettingsSchema = z.object({
  dailyGoal: z.number().int().min(0).max(50).optional(),
  aiPractice: z.boolean().optional(),
  readAloud: z.boolean().optional(),
  // Sensitive feature: an absent legacy value is an explicit opt-out.
  oralReading: z.boolean().default(false),
});
export type LearnerSettings = z.input<typeof learnerSettingsSchema>;

/** Enrollment controls plus learner-wide defaults projected onto kid surfaces. */
export type LearnerSurfaceConfig = EnrollmentConfig &
  Pick<LearnerSettings, "readAloud" | "oralReading">;

/** Do not auto-speak account content until the persisted learner setting arrives. */
export function shouldAutoRead(
  mode: "loading" | "guest" | "account",
  ready: boolean,
  readAloud: boolean | undefined,
): boolean {
  if (mode === "loading") return false;
  if (mode === "guest") return readAloud !== false;
  return ready && readAloud !== false;
}
