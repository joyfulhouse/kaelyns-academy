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
