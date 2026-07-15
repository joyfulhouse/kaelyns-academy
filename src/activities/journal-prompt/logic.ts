import { journalPromptConfig, type JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";

/** Server-safe schema + scoring for journal-prompt. No "use client". */
export const schema = journalPromptConfig;

const journalResponseMode = z.enum(["draw", "scribe", "type", "dictate"]);

/** Privacy-preserving participation summary. No child-created artifact leaves the Player. */
export const responseSchema = z
  .object({
    markCount: z.number().int().min(0).max(200),
    textLength: z.number().int().min(0).max(2_000),
    usedDictation: z.boolean(),
    mode: journalResponseMode,
    didDraw: z.boolean(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.didDraw !== (response.markCount > 0)) {
      context.addIssue({ code: "custom", message: "didDraw must match markCount" });
    }
    if (response.mode === "draw" && !response.didDraw) {
      context.addIssue({ code: "custom", message: "draw mode requires a mark" });
    }
    if (response.mode === "dictate" && !response.usedDictation) {
      context.addIssue({ code: "custom", message: "dictate mode requires recognized speech" });
    }
    if (response.usedDictation && response.textLength === 0) {
      context.addIssue({ code: "custom", message: "recognized speech requires contributed text" });
    }
    if (
      (response.mode === "scribe" || response.mode === "type") &&
      response.textLength === 0
    ) {
      context.addIssue({ code: "custom", message: "writing mode requires contributed text" });
    }
    if (response.markCount === 0 && response.textLength === 0 && !response.usedDictation) {
      context.addIssue({ code: "custom", message: "make a mark or add an idea first" });
    }
  });
export type JournalPromptResponse = z.infer<typeof responseSchema>;

/**
 * Journaling is expression, not assessment (PRODUCT.md §2). A genuine bounded
 * contribution earns celebration stars, but participation alone emits no
 * composition or stamina evidence.
 */
export function score(
  _config: JournalPromptConfig,
  _response: JournalPromptResponse,
): ActivityScore {
  return {
    correct: 1,
    total: 1,
    stars: 3,
    skillEvidence: [],
  };
}

export function skillsAffected(_config: JournalPromptConfig): SkillTag[] {
  return [];
}
