import { seqOrderConfig, type SeqOrderConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for seq-order. No "use client". */
export const schema = seqOrderConfig;

/** The card indices in the order the child tapped them + attempts. */
export interface SeqOrderResponse {
  attempts: number;
  order: number[];
}

/** Correct when the child tapped the cards in their config (array) order:
 *  the pos-th tap must be card index pos, for all positions. */
export function isCorrect(config: SeqOrderConfig, response: SeqOrderResponse): boolean {
  if (response.order.length !== config.cards.length) return false;
  return response.order.every((cardIndex, position) => cardIndex === position);
}

export function score(config: SeqOrderConfig, response: SeqOrderResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** Always the sequencing skill. */
export function skillsAffected(_config: SeqOrderConfig): SkillTag[] {
  return ["science.sequence"];
}
