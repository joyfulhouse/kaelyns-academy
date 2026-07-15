export const COIN_TYPES = ["penny", "nickel", "dime", "quarter"] as const;
export type Coin = (typeof COIN_TYPES)[number];

export const COIN_FACTS = {
  penny: { name: "Penny", cents: 1, diameter: 19, tone: "copper" },
  nickel: { name: "Nickel", cents: 5, diameter: 21, tone: "silver" },
  dime: { name: "Dime", cents: 10, diameter: 18, tone: "silver" },
  quarter: { name: "Quarter", cents: 25, diameter: 24, tone: "silver" },
} as const satisfies Record<
  Coin,
  { name: string; cents: number; diameter: number; tone: "copper" | "silver" }
>;

export const MAX_COIN_TOKENS = 20;

export interface CoinToken {
  id: string;
  type: Coin;
}

export function addCoin(tokens: CoinToken[], token: CoinToken): CoinToken[] {
  if (tokens.some((existing) => existing.id === token.id)) return tokens;
  return [...tokens, token];
}

export function removeCoin(tokens: CoinToken[], tokenId: string): CoinToken[] {
  const index = tokens.findIndex((token) => token.id === tokenId);
  if (index === -1) return tokens;
  return [...tokens.slice(0, index), ...tokens.slice(index + 1)];
}

export function sumCoins(tokens: CoinToken[]): number {
  return tokens.reduce((total, token) => total + COIN_FACTS[token.type].cents, 0);
}

export function hasCoinCapacity(tokens: CoinToken[]): boolean {
  return tokens.length < MAX_COIN_TOKENS;
}

/** Fewest palette tokens needed to make an exact target, or null when impossible. */
export function minimumCoinsForTotal(palette: Coin[], targetCents: number): number | null {
  const minimum = Array<number>(targetCents + 1).fill(Number.POSITIVE_INFINITY);
  minimum[0] = 0;

  for (let amount = 1; amount <= targetCents; amount += 1) {
    for (const coin of palette) {
      const previous = amount - COIN_FACTS[coin].cents;
      if (previous >= 0) {
        minimum[amount] = Math.min(minimum[amount], minimum[previous] + 1);
      }
    }
  }

  return Number.isFinite(minimum[targetCents]) ? minimum[targetCents] : null;
}
