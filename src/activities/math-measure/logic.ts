import { mathMeasureConfig, type MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import { deriveComparisonIndex, placedUnitCount } from "./measure-model";

/** Server-safe schema + scoring for math-measure. No "use client". */
export const schema = mathMeasureConfig;

const measureAttempts = z.number().int().min(1).max(20);
export const responseSchema = z.union([
  z
    .object({
      attempts: measureAttempts,
      selectedIndex: z.number().int().min(0).max(3),
    })
    .strict(),
  z
    .object({
      attempts: measureAttempts,
      placedUnitIds: z
        .array(z.string().min(1).max(24).regex(/^unit-[a-z0-9-]+$/))
        .max(12)
        .refine(
          (unitIds) => new Set(unitIds).size === unitIds.length,
          "placed unit IDs must be unique",
        ),
    })
    .strict(),
]);
export type MathMeasureResponse = z.infer<typeof responseSchema>;

export function isCorrect(config: MathMeasureConfig, response: MathMeasureResponse): boolean {
  if (config.mode === "compare") {
    const derived = deriveComparisonIndex(config.attribute, config.question, config.items);
    return "selectedIndex" in response && derived !== null && response.selectedIndex === derived;
  }
  return (
    "placedUnitIds" in response &&
    new Set(response.placedUnitIds).size === response.placedUnitIds.length &&
    placedUnitCount(response.placedUnitIds) === config.length
  );
}

export function score(config: MathMeasureConfig, response: MathMeasureResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** compare or units → always the measurement skill. */
export function skillsAffected(_config: MathMeasureConfig): SkillTag[] {
  return ["math.measure"];
}

/** B3 §6: the marked answer must be the true (unique) extreme / true length. */
export function validateGenerated(config: MathMeasureConfig): string | null {
  if (config.mode === "compare") {
    if (config.answerIndex >= config.items.length) return "answerIndex out of range";
    const derived = deriveComparisonIndex(config.attribute, config.question, config.items);
    if (derived === null) return "extreme is not unique";
    return config.answerIndex === derived ? null : "answer is not the extreme";
  }
  return null;
}
