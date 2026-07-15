import { journalPromptConfig, type JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { evenSkillEvidence } from "../_shared/scoring";

/** Server-safe schema + scoring for journal-prompt. No "use client". */
export const schema = journalPromptConfig;

/** What the child made: optional typed text and whether they drew something. */
export const responseSchema = z
  .object({
    text: z.string().max(2_000),
    /** Base64 PNG data URL of the doodle, when the canvas was used. */
    drawingDataUrl: z.string().startsWith("data:image/png;base64,").max(1_500_000).optional(),
    didDraw: z.boolean(),
  })
  .strict();
export type JournalPromptResponse = z.infer<typeof responseSchema>;

/**
 * Journaling is expression, not assessment (PRODUCT.md §2). Finishing always
 * earns the full three stars; we never grade a child's drawing or sentence.
 * The skill evidence is "solid" for stamina/sentence because they showed up
 * and made something.
 */
export function score(
  config: JournalPromptConfig,
  _response: JournalPromptResponse,
): ActivityScore {
  return {
    correct: 1,
    total: 1,
    stars: 3,
    skillEvidence: evenSkillEvidence(skillsAffected(config), "solid"),
  };
}

export function skillsAffected(_config: JournalPromptConfig): SkillTag[] {
  return ["writing.sentence", "habits.stamina"];
}
