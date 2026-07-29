import { z } from "zod";

export const typingWriteConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** "see" shows the word (copy typing); "hear" speaks it and hides it. */
    mode: z.enum(["see", "hear"]).default("see"),
    /** Sentences allow spaces, capitals, and end punctuation. */
    scope: z.enum(["word", "sentence"]).default("word"),
    items: z.array(z.string().trim().min(2).max(40)).min(3).max(12),
  })
  .strict();
export type TypingWriteConfig = z.input<typeof typingWriteConfig>;
