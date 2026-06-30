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
