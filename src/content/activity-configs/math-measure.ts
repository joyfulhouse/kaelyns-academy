import { z } from "zod";
import { deriveComparisonIndex } from "./math-measure-derivation";

const compareConfig = z
  .object({
    mode: z.literal("compare"),
    instruction: z.string(),
    attribute: z.enum(["length", "height", "weight"]),
    /** "most" → longest/tallest/heaviest; "least" → shortest/…/lightest. */
    question: z.enum(["most", "least"]),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8),
          /** Relative authored amount for the named attribute. */
          size: z.number().min(0).max(100),
        }),
      )
      .min(2)
      .max(4),
    answerIndex: z.number().int().min(0),
  })
  .superRefine((config, context) => {
    if (config.attribute === "weight" && config.items.length !== 2) {
      context.addIssue({
        code: "custom",
        message: "two-pan weight comparisons require exactly two items",
        path: ["items"],
      });
    }
    if (config.answerIndex >= config.items.length) {
      context.addIssue({
        code: "custom",
        message: "answerIndex out of range for items",
        path: ["answerIndex"],
      });
      return;
    }
    const derived = deriveComparisonIndex(config.attribute, config.question, config.items);
    if (derived === null) {
      context.addIssue({
        code: "custom",
        message: "comparison extreme must be unique",
        path: ["items"],
      });
      return;
    }
    if (config.answerIndex !== derived) {
      context.addIssue({
        code: "custom",
        message: "answerIndex contradicts the requested item sizes",
        path: ["answerIndex"],
      });
    }
  });

const unitsConfig = z
  .object({
    mode: z.literal("units"),
    instruction: z.string(),
    objectLabel: z.string().min(1).max(24).optional(),
    unit: z.enum(["cube", "paperclip", "block", "hand"]),
    /** One authored fact drives both the visual target length and expected placement count. */
    length: z.number().int().min(1).max(12),
    /** Legacy generated-item fields accepted only when they agree with `length`. */
    choices: z.array(z.number().int().min(0).max(20)).min(2).max(4).optional(),
    answerIndex: z.number().int().min(0).optional(),
  })
  .superRefine((config, context) => {
    const hasChoices = config.choices !== undefined;
    const hasAnswer = config.answerIndex !== undefined;
    if (hasChoices !== hasAnswer) {
      context.addIssue({
        code: "custom",
        message: "legacy choices and answerIndex must appear together",
        path: hasChoices ? ["answerIndex"] : ["choices"],
      });
      return;
    }
    if (!config.choices || config.answerIndex === undefined) return;
    if (new Set(config.choices).size !== config.choices.length) {
      context.addIssue({ code: "custom", message: "duplicate choices", path: ["choices"] });
    }
    if (config.answerIndex >= config.choices.length) {
      context.addIssue({
        code: "custom",
        message: "answerIndex out of range for choices",
        path: ["answerIndex"],
      });
      return;
    }
    if (config.choices[config.answerIndex] !== config.length) {
      context.addIssue({
        code: "custom",
        message: "legacy answer contradicts the visual length",
        path: ["answerIndex"],
      });
    }
  });

export const mathMeasureConfig = z.discriminatedUnion("mode", [compareConfig, unitsConfig]);
export type MathMeasureConfig = z.input<typeof mathMeasureConfig>;
