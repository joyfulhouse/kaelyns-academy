import { z } from "zod";

export const seqOrderConfig = z
  .object({
    instruction: z.string().min(1).max(240),
    /** ARRAY ORDER is the correct order (1st … last). 3–6 cards. */
    cards: z
      .array(
        z
          .object({
            label: z.string().min(1).max(24),
            emoji: z.string().min(1).max(8).optional(),
          })
          .strict(),
      )
      .min(3)
      .max(6),
  })
  .strict();
export type SeqOrderConfig = z.input<typeof seqOrderConfig>;
