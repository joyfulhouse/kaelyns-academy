import { phonicsWordbuildConfig, type PhonicsWordbuildConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for phonics-wordbuild. No "use client". */
export const schema = phonicsWordbuildConfig;

/** What the Player reports back: per-word, how many tries it took to build it. */
export interface PhonicsWordbuildResponse {
  /** One entry per target word, in config order. `tries` ≥ 1 for completed words. */
  builds: { word: string; tries: number }[];
}

/** Words that were spelled correctly on the very first attempt. */
function firstTryCount(response: PhonicsWordbuildResponse): number {
  return response.builds.filter((b) => b.tries === 1).length;
}

export function score(
  config: PhonicsWordbuildConfig,
  response: PhonicsWordbuildResponse,
): ActivityScore {
  const total = config.words.length;
  const correct = response.builds.length; // every reported build was completed (forgiving: always finishes)
  const firstTry = firstTryCount(response);
  const firstTryRate = total === 0 ? 1 : firstTry / total;

  return {
    correct,
    total,
    stars: starsFromAccuracy(firstTryRate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(firstTryRate)),
  };
}

/**
 * Skills evidenced by a wordbuild. Authors tag activities with the canonical
 * skill (e.g. "phonics.digraphs") on the Activity; this module derives a sane
 * default from the config focus so AI-generated configs still emit evidence.
 */
export function skillsAffected(config: PhonicsWordbuildConfig): SkillTag[] {
  const focus = config.focus.toLowerCase();
  if (focus.includes("digraph")) return ["phonics.digraphs"];
  if (focus.includes("final") && focus.includes("blend")) return ["phonics.blends.final"];
  if (focus.includes("blend")) return ["phonics.blends.initial"];
  if (focus.includes("diphthong")) return ["phonics.diphthongs"];
  if (focus.includes("ending") || focus.includes("suffix")) return ["phonics.endings"];
  return ["phonics.cvc"];
}
