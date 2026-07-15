// src/content/phonics.ts
/**
 * Pure, server-safe phonics helpers. NO "use client" and no client-only imports
 * so this is importable from BOTH the client Player and the server-side practice
 * repair (src/lib/ai/practice.ts) — they must segment words IDENTICALLY.
 */

/** Split a target word into the tiles that spell it, greedily matching the
 *  longest available multi-letter tile first (so "sh"+"i"+"p", not s+h+i+p). */
export function segmentWord(word: string, tiles: string[]): string[] {
  const byLengthDesc = [...new Set(tiles)].sort((a, b) => b.length - a.length);
  const segments: string[] = [];
  let i = 0;
  const lower = word.toLowerCase();
  while (i < lower.length) {
    const match = byLengthDesc.find((t) => lower.startsWith(t.toLowerCase(), i));
    if (!match) return [...lower.slice(i)]; // fall back to single chars for the remainder
    segments.push(match);
    i += match.length;
  }
  return segments;
}

/**
 * Find one exact spelling using stable tile indexes without reusing an
 * inventory item. Longer graphemes are considered first, with backtracking so
 * a locally-longest choice cannot hide another complete segmentation.
 */
export function findExactTileSegmentation(
  word: string,
  tiles: readonly string[],
): number[] | null {
  const target = word.toLocaleLowerCase();
  const candidates = tiles
    .map((text, index) => ({ text, index }))
    .sort((a, b) => b.text.length - a.text.length || a.index - b.index);
  const used = new Set<number>();

  function visit(offset: number): number[] | null {
    if (offset === target.length) return [];
    for (const tile of candidates) {
      if (used.has(tile.index)) continue;
      const text = tile.text.toLocaleLowerCase();
      if (!target.startsWith(text, offset)) continue;
      used.add(tile.index);
      const rest = visit(offset + text.length);
      if (rest) return [tile.index, ...rest];
      used.delete(tile.index);
    }
    return null;
  }

  return visit(0);
}

interface PhonicsInventoryConfig {
  tiles: readonly string[];
  words: readonly { word: string }[];
  say?: Readonly<Record<string, string>>;
  silent?: readonly string[];
}

/** Shared by authored config parsing and generated-item validation. */
export function validatePhonicsTileInventory(config: PhonicsInventoryConfig): string | null {
  const inventory = new Set(config.tiles);
  for (const key of Object.keys(config.say ?? {})) {
    if (!inventory.has(key)) return `say key ${key} is not in the tile inventory`;
  }
  for (const tile of config.silent ?? []) {
    if (!inventory.has(tile)) return `silent tile ${tile} is not in the tile inventory`;
  }
  for (const { word } of config.words) {
    if (!findExactTileSegmentation(word, config.tiles)) {
      return `${word} cannot be built from the supplied tile multiplicity`;
    }
  }
  return null;
}
