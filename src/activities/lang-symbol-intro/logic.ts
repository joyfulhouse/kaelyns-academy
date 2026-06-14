import { langSymbolIntroConfig, type LangSymbolIntroConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for lang-symbol-intro. No "use client". */
export const schema = langSymbolIntroConfig;

/** The child's answers to the quick verify questions (one choice index per item). */
export interface LangSymbolIntroResponse {
  verifyAnswers: number[];
}

export function score(
  config: LangSymbolIntroConfig,
  response: LangSymbolIntroResponse,
): ActivityScore {
  const verify = config.verify;
  const total = verify.length;
  let correct = 0;
  for (let i = 0; i < total; i++) {
    if (response.verifyAnswers[i] === verify[i].answerIndex) correct += 1;
  }
  // Forgiving by construction: an introduction can't be failed; stars reflect
  // how much of the quick check the child got on her own.
  const rate = total === 0 ? 1 : correct / total;
  return {
    correct,
    total,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** Skills ride on the config so AI-generated items are self-describing. */
export function skillsAffected(config: LangSymbolIntroConfig): SkillTag[] {
  return config.skillTags;
}
