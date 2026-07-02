import { mathMoneyConfig, type MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-money. No "use client". */
export const schema = mathMoneyConfig;

export type Coin = "penny" | "nickel" | "dime" | "quarter";
export const COIN_CENTS: Record<Coin, number> = { penny: 1, nickel: 5, dime: 10, quarter: 25 };

export function coinsTotal(coins: Coin[]): number {
  return coins.reduce((sum, c) => sum + COIN_CENTS[c], 0);
}

/** The child's final action + how many checks it took (≥1). */
export interface MathMoneyResponse {
  attempts: number;
  /** identify mode: the coin the child tapped. */
  tappedCoin?: Coin;
  /** count mode: the coins the child dropped into the tray. */
  tappedCoins?: Coin[];
}

export function isCorrect(config: MathMoneyConfig, response: MathMoneyResponse): boolean {
  if (config.mode === "identify") return response.tappedCoin === config.targetCoin;
  return coinsTotal(response.tappedCoins ?? []) === config.targetCents;
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
