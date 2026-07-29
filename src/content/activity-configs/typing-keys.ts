import { z } from "zod";

export const typingKeysConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** The keys this drill teaches, each a single character. */
    keys: z.array(z.string().length(1)).min(1).max(10),
    /** How many times the child cycles the whole set. */
    reps: z.number().int().min(1).max(3).default(2),
    /** Show the keyboard map. Off once she should be looking away. */
    showHands: z.boolean().default(true),
  })
  .strict();
export type TypingKeysConfig = z.input<typeof typingKeysConfig>;
