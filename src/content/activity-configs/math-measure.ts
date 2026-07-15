import { z } from "zod";

export const mathMeasureConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("compare"),
    instruction: z.string(),
    attribute: z.enum(["length", "height", "weight"]),
    /** "most" → longest/tallest/heaviest; "least" → shortest/…/lightest. */
    question: z.enum(["most", "least"]),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8),
          /** Visual proportion only (renders the bar/size); NOT the answer. */
          size: z.number().min(0).max(100),
        }),
      )
      .min(2)
      .max(4),
    answerIndex: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("units"),
    instruction: z.string(),
    unit: z.enum(["cube", "paperclip", "block", "hand"]),
    /** True length in units (the visual renders this many unit icons). */
    length: z.number().int().min(1).max(12),
    choices: z.array(z.number().int().min(0).max(20)).min(2).max(4),
    answerIndex: z.number().int().min(0),
  }),
]);
export type MathMeasureConfig = z.input<typeof mathMeasureConfig>;
