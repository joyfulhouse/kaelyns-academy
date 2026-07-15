import { z } from "zod";

const journalInputMode = z.enum(["scribe", "type", "dictate"]);

export const journalPromptConfig = z
  .object({
    // Empty remains valid while an admin draft skeleton is being assembled;
    // active authored activities provide the learner-facing prompt.
    prompt: z.string().max(500),
    sentenceStarter: z.string().min(1).max(200).optional(),
    drawing: z.boolean().default(true),
    // Writing-bridge (Program 02): compose at thinking-level without a transcription tax.
    mode: z.enum(["draw", "compose"]).default("draw"),
    frames: z.array(z.string().min(1).max(240)).max(8).default([]),
    wordBank: z.array(z.string().min(1).max(80)).max(20).default([]),
    allowModes: z
      .array(journalInputMode)
      .min(1)
      .max(3)
      .refine((modes) => new Set(modes).size === modes.length, "input modes must be unique")
      .default(["type"]),
  })
  .strict();
export type JournalPromptConfig = z.input<typeof journalPromptConfig>;
