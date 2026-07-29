import { typingWriteConfig, type TypingWriteConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import { MAX_ITEM_MS, MAX_ITEM_RETRIES } from "../_shared/typing/wordType";

/** Server-safe schema + scoring for typing-write. No "use client". */
export const schema = typingWriteConfig;

/**
 * §8: `missedExpected` may carry only characters of the EXPECTED item — the
 * schema bounds shape, `score` enforces provenance against the config and
 * fails closed. The typed buffer never appears here.
 */
export const responseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            i: z.number().int().min(0).max(11),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(MAX_ITEM_MS),
            retries: z.number().int().min(0).max(MAX_ITEM_RETRIES),
            missedExpected: z.array(z.string().length(1)).max(40),
          })
          .strict(),
      )
      .min(3)
      .max(12),
  })
  .strict();
export type TypingWriteResponse = z.infer<typeof responseSchema>;

function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

/** Shared with typing-race (same item shape). Exported for its logic module. */
export function itemsArePlausible(
  expected: readonly string[],
  items: TypingWriteResponse["items"],
): boolean {
  if (items.length !== expected.length) return false;
  return items.every((item, index) => {
    if (item.i !== index) return false;
    if (!item.missedExpected.every((ch) => expected[index].includes(ch))) return false;
    if (new Set(item.missedExpected).size !== item.missedExpected.length) return false;
    // ok must agree with the evidence carried alongside it. A diverged word
    // ALWAYS records its first episode's expected character (a clean
    // full-length buffer completes before any past-end key can land), so a
    // non-first-try item with an empty missedExpected is reducer-impossible —
    // forgery, not honest play.
    if (item.ok) return item.retries === 0 && item.missedExpected.length === 0;
    return (
      item.retries >= 1 &&
      item.missedExpected.length >= 1 &&
      item.missedExpected.length <= item.retries
    );
  });
}

export function score(config: TypingWriteConfig, response: TypingWriteResponse): ActivityScore {
  const expected = config.items;
  if (!itemsArePlausible(expected, response.items)) return noEvidence(expected.length);
  const firstTry = response.items.filter((item) => item.ok).length;
  const rate = firstTry / expected.length;
  return {
    correct: firstTry,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingWriteConfig): SkillTag[] {
  return skillsForTargets(config.items);
}

export function validateGenerated(config: TypingWriteConfig): string | null {
  for (const item of config.items) {
    for (const ch of item) {
      if (!isTeachableKey(ch)) return `untaught key in "${item}": ${ch}`;
    }
  }
  const seen = new Set(config.items.map((item) => item.toLowerCase()));
  if (seen.size !== config.items.length) return "duplicate item";
  return null;
}
