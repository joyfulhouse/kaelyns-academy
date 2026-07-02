import { mathMeasureConfig, type MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-measure. No "use client". */
export const schema = mathMeasureConfig;

/** The child's response: what they chose. */
export interface MathMeasureResponse {
  attempts: number;
  /** compare mode: index of the item they tapped. */
  selectedIndex?: number;
  /** units mode: their guess at the length. */
  guessedLength?: number;
}

export function isCorrect(config: MathMeasureConfig, response: MathMeasureResponse): boolean {
  if (config.mode === "compare") {
    return response.selectedIndex === config.answerIndex;
  }
  return response.guessedLength === config.length;
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
  return ["math.measurement"];
}
