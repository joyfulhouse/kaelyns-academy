import { mathMoneyConfig, type MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";
import {
  COIN_FACTS,
  MAX_COIN_TOKENS,
  minimumCoinsForTotal,
  sumCoins,
  type Coin,
  type CoinToken,
} from "./coin-model";

/** Server-safe schema + scoring for math-money. No "use client". */
export const schema = mathMoneyConfig;

export type { Coin, CoinToken } from "./coin-model";
export const COIN_CENTS: Record<Coin, number> = {
  penny: COIN_FACTS.penny.cents,
  nickel: COIN_FACTS.nickel.cents,
  dime: COIN_FACTS.dime.cents,
  quarter: COIN_FACTS.quarter.cents,
};

export function coinsTotal(coins: Coin[]): number {
  return coins.reduce((sum, c) => sum + COIN_CENTS[c], 0);
}

/** The child's final action + how many checks it took (≥1). */
const moneyAttempts = z.number().int().min(1).max(20);
const responseCoin = z.enum(["penny", "nickel", "dime", "quarter"]);
const responseToken = z
  .object({
    id: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/),
    type: responseCoin,
  })
  .strict();
export const responseSchema = z.union([
  z
    .object({
      attempts: moneyAttempts,
      /** identify mode: the coin the child tapped. */
      tappedCoin: responseCoin,
    })
    .strict(),
  z
    .object({
      attempts: moneyAttempts,
      /** count mode: stable coin instances the child placed into the tray. */
      tokens: z
        .array(responseToken)
        .max(MAX_COIN_TOKENS)
        .refine(
          (tokens) => new Set(tokens.map((token) => token.id)).size === tokens.length,
          "coin token IDs must be unique",
        ),
    })
    .strict(),
]);
export type MathMoneyResponse = z.infer<typeof responseSchema>;

export function isCorrect(config: MathMoneyConfig, response: MathMoneyResponse): boolean {
  if (config.mode === "identify") {
    return "tappedCoin" in response && response.tappedCoin === config.targetCoin;
  }
  if (!("tokens" in response)) return false;
  const ids = new Set(response.tokens.map((token) => token.id));
  return (
    ids.size === response.tokens.length &&
    response.tokens.every((token) => config.palette.includes(token.type)) &&
    sumCoins(response.tokens) === config.targetCents
  );
}

export function score(config: MathMoneyConfig, response: MathMoneyResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** identify or count → always the money skill. */
export function skillsAffected(_config: MathMoneyConfig): SkillTag[] {
  return ["math.money"];
}

/** B3 §6: deterministic answer-key consistency for generated money items. */
export function validateGenerated(config: MathMoneyConfig): string | null {
  if (config.mode === "identify") {
    if (new Set(config.coins).size !== config.coins.length) return "duplicate coins";
    if (!config.coins.includes(config.targetCoin)) return "targetCoin not among coins";
    return null;
  }
  if (new Set(config.palette).size !== config.palette.length) return "duplicate palette coins";
  const minimumTokens = minimumCoinsForTotal(config.palette, config.targetCents);
  if (minimumTokens === null) return "targetCents unreachable from palette";
  return minimumTokens <= MAX_COIN_TOKENS
    ? null
    : `targetCents requires more than ${MAX_COIN_TOKENS} coins`;
}
