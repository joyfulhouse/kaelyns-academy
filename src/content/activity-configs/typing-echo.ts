import { z } from "zod";

export const typingEchoConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** Each sequence is 2–4 characters: long enough to hold, short enough to
     *  recall without reading. */
    sequences: z.array(z.string().trim().min(2).max(4)).min(3).max(10),
    /** How long the sequence stays visible before hiding. */
    flashMs: z.number().int().min(400).max(2_000).default(1_200),
  })
  .strict();
export type TypingEchoConfig = z.input<typeof typingEchoConfig>;
