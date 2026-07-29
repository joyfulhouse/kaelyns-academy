import { z } from "zod";

export const typingRaceConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    words: z.array(z.string().trim().min(2).max(12)).min(6).max(20),
    /** The friendly pace comet's rate — a pacer, never another child. */
    pacerWpm: z.number().int().min(5).max(25).default(10),
  })
  .strict();
export type TypingRaceConfig = z.input<typeof typingRaceConfig>;
