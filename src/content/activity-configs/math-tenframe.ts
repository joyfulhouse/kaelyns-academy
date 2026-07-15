import { z } from "zod";

const instruction = z.string();
const count = z.number().int().min(0).max(20);
const frames = z.union([z.literal(1), z.literal(2)]).default(1);

/**
 * `target` is the desired count in represent mode and the visible starting
 * count in operation modes. Every operation result is derived from its bounded
 * operands, never authored a second time.
 */
export const mathTenframeConfig = z
  .discriminatedUnion("mode", [
    z
      .object({
        instruction,
        mode: z.literal("represent"),
        target: count,
        frames,
      })
      .strict(),
    z
      .object({
        instruction,
        mode: z.literal("add"),
        target: count,
        addend: count,
        frames,
      })
      .strict(),
    z
      .object({
        instruction,
        mode: z.literal("subtract"),
        target: count,
        subtrahend: count,
        frames,
      })
      .strict(),
    z
      .object({
        instruction,
        mode: z.literal("make-ten"),
        target: z.number().int().min(1).max(9),
        addend: z.number().int().min(1).max(20),
        frames: z.literal(2).default(2),
      })
      .strict(),
  ])
  .superRefine((config, context) => {
    const capacity = config.frames * 10;
    const addCapacityIssue = (message: string) =>
      context.addIssue({ code: "custom", path: ["target"], message });

    switch (config.mode) {
      case "represent":
        if (config.target > capacity) {
          addCapacityIssue("The target exceeds the selected frame capacity.");
        }
        break;
      case "add":
        if (config.target + config.addend > capacity) {
          addCapacityIssue("The sum exceeds the selected frame capacity.");
        }
        break;
      case "subtract":
        if (config.target > capacity) {
          addCapacityIssue("The starting count exceeds the selected frame capacity.");
        }
        if (config.subtrahend > config.target) {
          context.addIssue({
            code: "custom",
            path: ["subtrahend"],
            message: "The difference cannot be negative.",
          });
        }
        break;
      case "make-ten": {
        const sum = config.target + config.addend;
        if (sum < 10) {
          addCapacityIssue("A make-ten task must fill the first frame.");
        }
        if (sum > capacity) {
          addCapacityIssue("The sum exceeds two-frame capacity.");
        }
        break;
      }
    }
  });

export type MathTenframeConfig = z.input<typeof mathTenframeConfig>;
