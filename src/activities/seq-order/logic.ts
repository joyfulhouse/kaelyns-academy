import { seqOrderConfig, type SeqOrderConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import { sequenceComplete } from "./model";

/** Server-safe schema + scoring for seq-order. No "use client". */
export const schema = seqOrderConfig;

/** The card indices in the order the child tapped them + attempts. */
export const responseSchema = z
  .object({
    attempts: z.number().int().min(1).max(20),
    order: z
      .array(z.number().int().min(0).max(5))
      .min(3)
      .max(6)
      .refine((order) => new Set(order).size === order.length, "card indices must be unique"),
  })
  .strict();
export type SeqOrderResponse = z.infer<typeof responseSchema>;

/** Correct when the child tapped the cards in their config (array) order:
 *  the pos-th tap must be card index pos, for all positions. */
export function isCorrect(config: SeqOrderConfig, response: SeqOrderResponse): boolean {
  if (!sequenceComplete(response.order, config.cards.length)) return false;
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

/** B3 §6: structural only — labels unique (factuality is constrained by the brief). */
export function validateGenerated(config: SeqOrderConfig): string | null {
  const labels = config.cards.map((c) => c.label.trim().toLowerCase());
  return new Set(labels).size === labels.length ? null : "duplicate card labels";
}
