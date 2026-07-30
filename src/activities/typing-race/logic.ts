import { typingRaceConfig, type TypingRaceConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import { MAX_ITEM_MS, MAX_ITEM_RETRIES } from "../_shared/typing/wordType";
import { itemsArePlausible } from "../typing-write/logic";

/** Server-safe schema + scoring for typing-race. No "use client". */
export const schema = typingRaceConfig;
export const MAX_RACE_ELAPSED_MS = 1_600_000;

/**
 * §8: same per-item shape as typing-write (shared `itemsArePlausible`), plus
 * a clockless `elapsedMs` used only for the kid-facing pace comet — never as
 * scoring evidence.
 */
export const responseSchema = z
  .object({
    words: z
      .array(
        z
          .object({
            i: z.number().int().min(0).max(19),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(MAX_ITEM_MS),
            retries: z.number().int().min(0).max(MAX_ITEM_RETRIES),
            missedExpected: z.array(z.string().length(1)).max(40),
          })
          .strict(),
      )
      .min(6)
      .max(20),
    elapsedMs: z.number().int().min(0).max(MAX_RACE_ELAPSED_MS),
  })
  .strict();
export type TypingRaceResponse = z.infer<typeof responseSchema>;

function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

/** §8 opt-in server-provenance hook — see typing-write's `validateResponse`. */
export function validateResponse(
  config: TypingRaceConfig,
  response: TypingRaceResponse,
): string | null {
  return itemsArePlausible(config.words, response.words) ? null : "implausible typing response";
}

export function score(config: TypingRaceConfig, response: TypingRaceResponse): ActivityScore {
  const expected = config.words;
  if (!itemsArePlausible(expected, response.words)) return noEvidence(expected.length);
  const firstTry = response.words.filter((word) => word.ok).length;
  const rate = firstTry / expected.length;
  return {
    correct: firstTry,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingRaceConfig): SkillTag[] {
  return [...skillsForTargets(config.words), "typing.fluency.rate"].sort() as SkillTag[];
}

export function validateGenerated(config: TypingRaceConfig): string | null {
  for (const word of config.words) {
    for (const ch of word) {
      if (!isTeachableKey(ch)) return `untaught key in "${word}": ${ch}`;
    }
  }
  const seen = new Set(config.words.map((word) => word.toLowerCase()));
  if (seen.size !== config.words.length) return "duplicate word";
  return null;
}
