import { mathMeasureConfig, type MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import {
  allComparisonItemsAligned,
  analyzeUnitPlacements,
  deriveComparisonIndex,
  MAX_MEASUREMENT_UNITS,
} from "./measure-model";

/** Server-safe schema + scoring for math-measure. No "use client". */
export const schema = mathMeasureConfig;

const measureAttempts = z.number().int().min(1).max(20);
export const responseSchema = z.union([
  z
    .object({
      attempts: measureAttempts,
      selectedIndex: z.number().int().min(0).max(3),
      alignedItemIndices: z
        .array(z.number().int().min(0).max(3))
        .max(4)
        .refine(
          (indices) => new Set(indices).size === indices.length,
          "aligned item indices must be unique",
        ),
    })
    .strict(),
  z
    .object({
      attempts: measureAttempts,
      placements: z
        .array(
          z
            .object({
              id: z.string().min(1).max(24).regex(/^unit-[a-z0-9-]+$/),
              slot: z.number().int().min(0).max(MAX_MEASUREMENT_UNITS - 1),
            })
            .strict(),
        )
        .max(MAX_MEASUREMENT_UNITS)
        .refine(
          (placements) =>
            new Set(placements.map((placement) => placement.id)).size === placements.length,
          "placed unit IDs must be unique",
        ),
    })
    .strict(),
]);
export type MathMeasureResponse = z.infer<typeof responseSchema>;

export function isCorrect(config: MathMeasureConfig, response: MathMeasureResponse): boolean {
  if (config.mode === "compare") {
    const derived = deriveComparisonIndex(config.attribute, config.question, config.items);
    if (!("selectedIndex" in response) || derived === null || response.selectedIndex !== derived) {
      return false;
    }
    return config.attribute === "weight"
      ? response.alignedItemIndices.length === 0
      : allComparisonItemsAligned(response.alignedItemIndices, config.items.length);
  }
  return (
    "placements" in response &&
    new Set(response.placements.map((placement) => placement.id)).size ===
      response.placements.length &&
    analyzeUnitPlacements(response.placements, config.length).issue === "none"
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
