import { z } from "zod";

const instructionAndTile = {
  instruction: z.string(),
  emoji: z.string().optional(),
};

const dimension = z.number().int().min(1).max(12);
const rectangleConfig = <Mode extends "build" | "multiply" | "area">(mode: Mode) =>
  z
    .object({
      ...instructionAndTile,
      mode: z.literal(mode),
      rows: dimension,
      cols: dimension,
    })
    .strict();

const divideConfig = z
  .object({
    ...instructionAndTile,
    mode: z.literal("divide"),
    total: z.number().int().min(1).max(144),
    groups: dimension,
  })
  .strict()
  .superRefine((config, context) => {
    if (config.total % config.groups !== 0) {
      context.addIssue({
        code: "custom",
        path: ["total"],
        message: "The total must divide evenly among the groups.",
      });
      return;
    }

    if (config.total / config.groups > 12) {
      context.addIssue({
        code: "custom",
        path: ["total"],
        message: "Each equal share must contain at most 12 items.",
      });
    }
  });

/** One authored model is the sole source of truth for every array task. */
export const mathArrayConfig = z.discriminatedUnion("mode", [
  rectangleConfig("build"),
  rectangleConfig("multiply"),
  divideConfig,
  rectangleConfig("area"),
]);

export type MathArrayConfig = z.input<typeof mathArrayConfig>;
