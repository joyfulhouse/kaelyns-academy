import { phonicsWordbuildConfig, type PhonicsWordbuildConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";
import {
  isExactBuild,
  MAX_PHONICS_ATTEMPTS,
  MAX_PHONICS_TILES,
  MAX_PHONICS_WORDS,
  validatePhonicsInventory,
} from "./model";

/** Server-safe schema + scoring for phonics-wordbuild. No "use client". */
export const schema = phonicsWordbuildConfig;

/** What the Player reports back: per-word, how many tries it took to build it. */
export const responseSchema = z
  .object({
    /** One completed entry per target word. Text is derived from stable tile indexes. */
    builds: z
      .array(
        z
          .object({
            wordIndex: z.number().int().min(0).max(MAX_PHONICS_WORDS - 1),
            tileIndices: z
              .array(z.number().int().min(0).max(MAX_PHONICS_TILES - 1))
              .min(1)
              .max(MAX_PHONICS_TILES)
              .refine((indexes) => new Set(indexes).size === indexes.length, {
                message: "tile indices must be unique within a build",
              }),
            attempts: z.number().int().min(1).max(MAX_PHONICS_ATTEMPTS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_PHONICS_WORDS),
  })
  .strict();
export type PhonicsWordbuildResponse = z.infer<typeof responseSchema>;

/** Words that were spelled correctly on the very first attempt. */
function firstTryCount(response: PhonicsWordbuildResponse): number {
  return response.builds.filter((build) => build.attempts === 1).length;
}

function assertCompleteValidBuilds(
  config: PhonicsWordbuildConfig,
  response: PhonicsWordbuildResponse,
): void {
  if (response.builds.length !== config.words.length) throw new Error("invalid phonics build count");
  const seenWords = new Set<number>();
  for (const build of response.builds) {
    const target = config.words[build.wordIndex];
    if (
      !target ||
      seenWords.has(build.wordIndex) ||
      !isExactBuild(target.word, build.tileIndices, config.tiles)
    ) {
      throw new Error("invalid phonics build");
    }
    seenWords.add(build.wordIndex);
  }
}

export function score(
  config: PhonicsWordbuildConfig,
  response: PhonicsWordbuildResponse,
): ActivityScore {
  assertCompleteValidBuilds(config, response);
  const total = config.words.length;
  const correct = response.builds.length;
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
  // Ordered syllable assembly directly observes division/decoding. Merely
  // spelling a root, prefix, or syllable-type example does not observe meaning
  // or classification, so those richer claims intentionally emit no evidence.
  if (focus.includes("syllable") && focus.includes("divid")) return ["word.syllables.division"];
  if (focus.includes("syllable") || focus.includes("prefix") || focus.includes("root")) return [];
  // Program-01 phonics (unchanged):
  if (focus.includes("digraph")) return ["phonics.digraphs"];
  if (focus.includes("final") && focus.includes("blend")) return ["phonics.blends.final"];
  if (focus.includes("blend")) return ["phonics.blends.initial"];
  if (focus.includes("diphthong")) return ["phonics.diphthongs"];
  if (focus.includes("ending") || focus.includes("suffix")) return ["phonics.endings"];
  return ["phonics.cvc"];
}

export function validateGenerated(config: PhonicsWordbuildConfig): string | null {
  return validatePhonicsInventory(config);
}
