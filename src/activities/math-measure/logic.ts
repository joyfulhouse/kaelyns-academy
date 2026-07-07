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

/** Both modes are tap-a-choice; the child's pick + attempts. */
export interface MathMeasureResponse {
  attempts: number;
  selectedIndex: number;
}

export function isCorrect(config: MathMeasureConfig, response: MathMeasureResponse): boolean {
  return response.selectedIndex === config.answerIndex;
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
    const sizes = config.items.map((i) => i.size);
    const extreme = config.question === "most" ? Math.max(...sizes) : Math.min(...sizes);
    if (sizes.filter((s) => s === extreme).length !== 1) return "extreme is not unique";
    return sizes[config.answerIndex] === extreme ? null : "answer is not the extreme";
  }
  if (config.answerIndex >= config.choices.length) return "answerIndex out of range";
  if (new Set(config.choices).size !== config.choices.length) return "duplicate choices";
  return config.choices[config.answerIndex] === config.length
    ? null
    : "answer choice does not equal the true length";
}
