import { z } from "zod";

export const journalPromptConfig = z.object({
  prompt: z.string(),
  sentenceStarter: z.string().optional(),
  drawing: z.boolean().default(true),
  // Writing-bridge (Program 02): compose at thinking-level without a transcription tax.
  mode: z.enum(["draw", "compose"]).default("draw"),
  frames: z.array(z.string()).default([]), // sentence frames, e.g. "The ___ erupted because ___."
  wordBank: z.array(z.string()).default([]),
  allowModes: z.array(z.enum(["scribe", "type", "dictate"])).default(["type"]),
});
export type JournalPromptConfig = z.input<typeof journalPromptConfig>;
