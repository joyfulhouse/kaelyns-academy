import { sortCategoriesConfig, type SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for sort-categories. No "use client". */
export const schema = sortCategoriesConfig;

/** The child's final placement (one binId per item, by item index) + attempts. */
export interface SortCategoriesResponse {
  attempts: number;
  placements: string[];
}

export function isCorrect(config: SortCategoriesConfig, response: SortCategoriesResponse): boolean {
  if (response.placements.length !== config.items.length) return false;
  return config.items.every((item, i) => response.placements[i] === item.binId);
}

export function score(config: SortCategoriesConfig, response: SortCategoriesResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** Always the classification skill. */
export function skillsAffected(_config: SortCategoriesConfig): SkillTag[] {
  return ["science.classify"];
}
