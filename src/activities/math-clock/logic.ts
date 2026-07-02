import { mathClockConfig, type MathClockConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-clock. No "use client". */
export const schema = mathClockConfig;

/** The child's final action + how many checks it took (≥1). */
export interface MathClockResponse {
  attempts: number;
  /** read mode: the digital-time choice index the child tapped. */
  selectedIndex?: number;
  /** set mode: the clock the child made. */
  setHour?: number;
  setMinute?: number;
}

export function isCorrect(config: MathClockConfig, response: MathClockResponse): boolean {
  if (config.mode === "read") return response.selectedIndex === config.answerIndex;
  return response.setHour === config.targetHour && response.setMinute === config.targetMinute;
}

export function score(config: MathClockConfig, response: MathClockResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** read or set → always the clock/time skill. */
export function skillsAffected(_config: MathClockConfig): SkillTag[] {
  return ["math.time"];
}
