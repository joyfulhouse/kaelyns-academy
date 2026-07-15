import { sortCategoriesConfig, type SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import { assignmentsComplete } from "./model";

/** Server-safe schema + scoring for sort-categories. No "use client". */
export const schema = sortCategoriesConfig;

/** The child's final placement (one binId per item, by item index) + attempts. */
export const responseSchema = z
  .object({
    attempts: z.number().int().min(1).max(20),
    assignments: z
      .array(
        z
          .object({
            itemIndex: z.number().int().min(0).max(7),
            binId: z.string().min(1).max(24),
          })
          .strict(),
      )
      .min(3)
      .max(8)
      .refine(
        (assignments) =>
          new Set(assignments.map((assignment) => assignment.itemIndex)).size ===
          assignments.length,
        "item assignments must be unique",
      ),
  })
  .strict();
export type SortCategoriesResponse = z.infer<typeof responseSchema>;

export function isCorrect(config: SortCategoriesConfig, response: SortCategoriesResponse): boolean {
  if (!assignmentsComplete(config, response.assignments)) return false;
  return response.assignments.every(
    (assignment) => config.items[assignment.itemIndex]?.binId === assignment.binId,
  );
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

/** B3 §6: bins unique, every bin used (binId integrity is the schema refine). */
export function validateGenerated(config: SortCategoriesConfig): string | null {
  const ids = config.bins.map((b) => b.id);
  if (new Set(ids).size !== ids.length) return "duplicate bin ids";
  for (const bin of config.bins) {
    if (!config.items.some((it) => it.binId === bin.id)) return `bin "${bin.id}" has no items`;
  }
  return null;
}
