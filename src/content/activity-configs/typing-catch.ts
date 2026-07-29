import { z } from "zod";

export const typingCatchConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** Single characters in slice 1; word targets arrive with slice 2. */
    pool: z.array(z.string().length(1)).min(2).max(24),
    durationSec: z.number().int().min(30).max(90).default(45),
    lives: z.number().int().min(1).max(5).default(3),
    speed: z.enum(["gentle", "steady", "zippy"]).default("gentle"),
  })
  .strict();
export type TypingCatchConfig = z.input<typeof typingCatchConfig>;
