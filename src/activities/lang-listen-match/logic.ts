import { langListenMatchConfig, type LangListenMatchConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for lang-listen-match. No "use client". */
export const schema = langListenMatchConfig;

/** The choice index the child tapped for each listening item. */
export const responseSchema = z
  .object({ answers: z.array(z.number().int().min(0).max(5)).min(1).max(12) })
  .strict();
export type LangListenMatchResponse = z.infer<typeof responseSchema>;

export function score(
  config: LangListenMatchConfig,
  response: LangListenMatchResponse,
): ActivityScore {
  const items = config.items;
  const total = items.length;
  let correct = 0;
  for (let i = 0; i < total; i++) {
    if (response.answers[i] === items[i].answerIndex) correct += 1;
  }
  const rate = total === 0 ? 1 : correct / total;
  return {
    correct,
    total,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** Skills ride on the config so AI-generated items are self-describing. */
export function skillsAffected(config: LangListenMatchConfig): SkillTag[] {
  return config.skillTags;
}
