import { phonicsWordbuildConfig, type PhonicsWordbuildConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for phonics-wordbuild. No "use client". */
export const schema = phonicsWordbuildConfig;

/** What the Player reports back: per-word, how many tries it took to build it. */
export const responseSchema = z
  .object({
    /** One entry per target word, in config order. `tries` ≥ 1 for completed words. */
    builds: z
      .array(
        z
          .object({
            word: z.string().min(1).max(32),
            tries: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export type PhonicsWordbuildResponse = z.infer<typeof responseSchema>;

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
  // Word Study (grade-1 ramp) focus strings → the authored word.* slugs
  // (B3 §7 — the recommender gates on these; the legacy phonics.* defaults miss
  // them). Most-specific first. No Program-01 phonics focus contains these
  // substrings (syllable/divid/prefix/root), so its evidence is byte-identical.
  if (focus.includes("syllable") && focus.includes("divid")) return ["word.syllables.division"];
  if (focus.includes("syllable")) return ["word.syllables.types"];
  if (focus.includes("prefix")) return ["word.morphology.prefixes"];
  if (focus.includes("root")) return ["word.morphology.roots"];
  // Program-01 phonics (unchanged):
  if (focus.includes("digraph")) return ["phonics.digraphs"];
  if (focus.includes("final") && focus.includes("blend")) return ["phonics.blends.final"];
  if (focus.includes("blend")) return ["phonics.blends.initial"];
  if (focus.includes("diphthong")) return ["phonics.diphthongs"];
  if (focus.includes("ending") || focus.includes("suffix")) return ["phonics.endings"];
  return ["phonics.cvc"];
}
