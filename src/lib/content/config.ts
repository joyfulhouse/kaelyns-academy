import { z } from "zod";
export const enrollmentConfigSchema = z.object({
  band: z.enum(["ready", "stretch"]).optional(),
  activeUnitKeys: z.array(z.string().min(1)).optional(),
  aiPractice: z.boolean().optional(),
  dailyGoal: z.number().int().min(0).max(50).optional(),
});
export type EnrollmentConfig = z.infer<typeof enrollmentConfigSchema>;
export const learnerSettingsSchema = z.object({
  dailyGoal: z.number().int().min(0).max(50).optional(),
  aiPractice: z.boolean().optional(),
  readAloud: z.boolean().optional(),
});
export type LearnerSettings = z.infer<typeof learnerSettingsSchema>;
