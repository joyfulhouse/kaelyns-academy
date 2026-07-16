import { z } from "zod";

const fractionFields = {
  instruction: z.string(),
  numerator: z.number().int().min(1).max(4),
  denominator: z.number().int().min(2).max(4),
};

/** A deliberately narrow equal-parts contract: partition a bar or identify its pieces. */
export const mathFractionBarConfig = z
  .discriminatedUnion("mode", [
    z.object({ ...fractionFields, mode: z.literal("partition") }).strict(),
    z.object({ ...fractionFields, mode: z.literal("identify") }).strict(),
  ])
  .superRefine((config, context) => {
    if (config.numerator > config.denominator) {
      context.addIssue({
        code: "custom",
        path: ["numerator"],
        message: "The numerator cannot exceed the denominator.",
      });
    }
  });

export type MathFractionBarConfig = z.input<typeof mathFractionBarConfig>;
