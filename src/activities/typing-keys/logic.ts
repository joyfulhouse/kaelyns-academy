import { typingKeysConfig, type TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for typing-keys. No "use client". */
export const schema = typingKeysConfig;

const DEFAULT_REPS = 2;

/**
 * The canonical prompt order: the whole key set, once per rep. Both the Player
 * and `score` derive it from this one function, so a response can be checked
 * against the exact sequence the child was actually shown.
 */
export function expectedPrompts(config: TypingKeysConfig): string[] {
  const reps = config.reps ?? DEFAULT_REPS;
  return Array.from({ length: reps }, () => config.keys).flat();
}

/**
 * §8: only the EXPECTED key is recorded, plus how many retries it took. Which
 * key the child actually pressed never leaves the component.
 */
export const responseSchema = z
  .object({
    prompts: z
      .array(
        z
          .object({
            key: z.string().length(1),
            ok: z.boolean(),
            retries: z.number().int().min(0).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export type TypingKeysResponse = z.infer<typeof responseSchema>;

/** Zero evidence, one star for showing up — the fail-closed shape. */
function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

export function score(
  config: TypingKeysConfig,
  response: TypingKeysResponse,
): ActivityScore {
  const expected = expectedPrompts(config);
  const matchesDrill =
    response.prompts.length === expected.length &&
    response.prompts.every((prompt, index) => prompt.key === expected[index]);
  if (!matchesDrill) return noEvidence(expected.length);
  // Key Camp is retry-until-right, so a genuine completion has every prompt
  // satisfied. Anything else is malformed, and `completionPolicy: "full-score"`
  // rejects it at the server boundary.
  if (!response.prompts.every((prompt) => prompt.ok)) return noEvidence(expected.length);

  const firstTry = response.prompts.filter((prompt) => prompt.retries === 0).length;
  const rate = firstTry / expected.length;
  return {
    correct: expected.length,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingKeysConfig): SkillTag[] {
  return skillsForTargets(config.keys);
}

export function validateGenerated(config: TypingKeysConfig): string | null {
  const seen = new Set<string>();
  for (const key of config.keys) {
    if (!isTeachableKey(key)) return `untaught key: ${key}`;
    if (seen.has(key)) return `duplicate key: ${key}`;
    seen.add(key);
  }
  return null;
}
