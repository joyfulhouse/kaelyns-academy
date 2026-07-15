import { z } from "zod";

// ── Life Skills Math (Adventure 2.0 B1) ──────────────────────────────────────

export const mathClockConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("read"),
    instruction: z.string(),
    hour: z.number().int().min(1).max(12),
    minute: z.union([z.literal(0), z.literal(30)]),
    /** Digital-time choices like "3:00" / "3:30". */
    choices: z.array(z.string().min(1).max(8)).min(2).max(4),
    answerIndex: z.number().int().min(0),
  }).strict(),
  z.object({
    mode: z.literal("set"),
    instruction: z.string(),
    targetHour: z.number().int().min(1).max(12),
    targetMinute: z.union([z.literal(0), z.literal(30)]),
  }).strict(),
]);
export type MathClockConfig = z.input<typeof mathClockConfig>;
