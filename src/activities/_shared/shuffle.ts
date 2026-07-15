/**
 * Deterministic Fisher–Yates shuffle driven by a small seeded LCG. The same
 * `(items, seed)` always yields the same order, so a Player can lay out tiles or
 * cards in a stable-but-varied arrangement that survives re-renders (the seed is
 * derived from the content + item index, not `Math.random`). Returns a new array;
 * the input is not mutated.
 */
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type StableSeedPart = string | number | boolean | null | undefined;

/**
 * Small deterministic FNV-1a hash for authored activity identity. Type and
 * separator bytes are included so `['1', 2]` cannot collapse into `[1, '2']`.
 */
export function stableSeed(parts: readonly StableSeedPart[]): number {
  let hash = 2_166_136_261;
  for (const part of parts) {
    const encoded = `${typeof part}:${String(part)}\u001f`;
    for (let index = 0; index < encoded.length; index += 1) {
      hash ^= encoded.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619) >>> 0;
    }
  }
  return hash || 1;
}

/**
 * Deterministically shuffle while guaranteeing authored order is never shown
 * unchanged when there is more than one item. The swap fallback is deliberately
 * simple: it runs only when Fisher–Yates happens to return the identity order.
 */
export function shuffleNonIdentity<T>(items: T[], seed: number): T[] {
  const out = shuffle(items, seed);
  if (out.length > 1 && out.every((item, index) => Object.is(item, items[index]))) {
    [out[0], out[1]] = [out[1], out[0]];
  }
  return out;
}
