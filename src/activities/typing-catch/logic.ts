import { typingCatchConfig, type TypingCatchConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for typing-catch. No "use client". */
export const schema = typingCatchConfig;

/** Seconds a star takes to drift from the top of the sky to the ground. */
export const FALL_SECONDS = { gentle: 8, steady: 5, zippy: 3 } as const;

const DEFAULT_DURATION_SEC = 45;
const DEFAULT_SPEED = "gentle";

/** Two spawns per fall, so at most two stars share the sky. */
export function spawnIntervalMs(config: TypingCatchConfig): number {
  return (FALL_SECONDS[config.speed ?? DEFAULT_SPEED] / 2) * 1_000;
}

export function roundDurationMs(config: TypingCatchConfig): number {
  return (config.durationSec ?? DEFAULT_DURATION_SEC) * 1_000;
}

/** How long a star spends in the sky before it reaches the ground. */
export function fallMs(config: TypingCatchConfig): number {
  return FALL_SECONDS[config.speed ?? DEFAULT_SPEED] * 1_000;
}

/** Last instant at which a newly shown star can receive its full fall window. */
export function spawnCutoffMs(config: TypingCatchConfig): number {
  return roundDurationMs(config) - fallMs(config);
}

/**
 * Exact number of stars in a timed round. The first appears at zero, and a star
 * may appear on the cutoff itself because it still receives one complete fall.
 * Runtime and plausibility bounds all consume this one derivation.
 */
export function expectedSpawnCount(config: TypingCatchConfig): number {
  return Math.max(1, Math.floor(spawnCutoffMs(config) / spawnIntervalMs(config)) + 1);
}

/**
 * §8: every recorded target is one the config itself authored, so this carries
 * no free child input. `ms` is client-measured and feeds display only — `score`
 * never reads it.
 */
export const responseSchema = z
  .object({
    prompts: z
      .array(
        z
          .object({
            text: z.string().min(1).max(12),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(120_000),
          })
          .strict(),
      )
      .min(1)
      .max(120),
    endedBy: z.enum(["time", "lives"]),
    elapsedMs: z.number().int().min(0).max(180_000),
  })
  .strict();
export type TypingCatchResponse = z.infer<typeof responseSchema>;

function matchesSpawnBag(config: TypingCatchConfig, prompts: TypingCatchResponse["prompts"]) {
  const remaining = new Map<string, number>();
  for (const prompt of prompts) {
    remaining.set(prompt.text, (remaining.get(prompt.text) ?? 0) + 1);
  }
  for (let index = 0; index < prompts.length; index += 1) {
    const expected = config.pool[index % config.pool.length]!;
    const count = remaining.get(expected) ?? 0;
    if (count === 0) return false;
    remaining.set(expected, count - 1);
  }
  return true;
}

export function score(
  config: TypingCatchConfig,
  response: TypingCatchResponse,
): ActivityScore {
  const pool = new Set(config.pool);
  const misses = response.prompts.filter((prompt) => !prompt.ok).length;
  const endingIsPlausible =
    response.endedBy === "lives"
      ? misses >= (config.lives ?? 3)
      : response.prompts.length === expectedSpawnCount(config);
  const plausible =
    response.prompts.length <= expectedSpawnCount(config) &&
    response.prompts.every((prompt) => pool.has(prompt.text)) &&
    endingIsPlausible &&
    matchesSpawnBag(config, response.prompts);
  // Fail closed: an implausible round scores nothing and moves no mastery,
  // rather than being rejected outright — the child may simply have hit a bug,
  // and losing an attempt is worse than losing the evidence.
  if (!plausible) {
    return { correct: 0, total: response.prompts.length, stars: 1, skillEvidence: [] };
  }

  const caught = response.prompts.filter((prompt) => prompt.ok).length;
  const rate = caught / response.prompts.length;
  return {
    correct: caught,
    total: response.prompts.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingCatchConfig): SkillTag[] {
  return skillsForTargets(config.pool);
}

export function validateGenerated(config: TypingCatchConfig): string | null {
  const seen = new Set<string>();
  for (const target of config.pool) {
    if (!isTeachableKey(target)) return `untaught key: ${target}`;
    if (seen.has(target)) return `duplicate target: ${target}`;
    seen.add(target);
  }
  return null;
}
