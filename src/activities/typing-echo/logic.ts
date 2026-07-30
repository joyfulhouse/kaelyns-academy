import { typingEchoConfig, type TypingEchoConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";
import { MAX_ITEM_MS, MAX_ITEM_RETRIES } from "../_shared/typing/wordType";
import { itemsArePlausible } from "../typing-write/logic";

/** Server-safe schema + scoring for typing-echo. No "use client". */
export const schema = typingEchoConfig;

/**
 * §8: identical per-item shape to typing-write/race — only EXPECTED characters
 * are ever recorded. Bounds import the shared clamp constants so the client's
 * clamps and this gate can never drift.
 */
export const responseSchema = z
  .object({
    sequences: z
      .array(
        z
          .object({
            i: z.number().int().min(0).max(9),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(MAX_ITEM_MS),
            retries: z.number().int().min(0).max(MAX_ITEM_RETRIES),
            missedExpected: z.array(z.string().length(1)).max(8),
          })
          .strict(),
      )
      .min(3)
      .max(10),
  })
  .strict();
export type TypingEchoResponse = z.infer<typeof responseSchema>;

function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

/** §8 opt-in server-provenance hook — see typing-write's `validateResponse`. */
export function validateResponse(
  config: TypingEchoConfig,
  response: TypingEchoResponse,
): string | null {
  return itemsArePlausible(config.sequences, response.sequences)
    ? null
    : "implausible typing response";
}

export function score(config: TypingEchoConfig, response: TypingEchoResponse): ActivityScore {
  const expected = config.sequences;
  if (!itemsArePlausible(expected, response.sequences)) return noEvidence(expected.length);
  const firstTry = response.sequences.filter((item) => item.ok).length;
  const rate = firstTry / expected.length;
  return {
    correct: firstTry,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingEchoConfig): SkillTag[] {
  return skillsForTargets(config.sequences);
}

export function validateGenerated(config: TypingEchoConfig): string | null {
  for (const sequence of config.sequences) {
    for (const ch of sequence) {
      if (!isTeachableKey(ch)) return `untaught key in "${sequence}": ${ch}`;
    }
  }
  const seen = new Set(config.sequences.map((s) => s.toLowerCase()));
  if (seen.size !== config.sequences.length) return "duplicate sequence";
  return null;
}
