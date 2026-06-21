// src/lib/audio/phonemeCheck.ts
/**
 * Pure plausibility check for an AI-proposed phoneme override against the word's
 * REAL phonemes from Kokoro/misaki (see {@link import("./phonemize").phonemize}).
 *
 * A generated phonics tile carries a `say` IPA so the lone tile voices its in-word
 * sound (see src/lib/audio/phonemes.ts). The model is good at this but can
 * hallucinate; we drop an implausible override (→ bare fallback, no regression).
 *
 * Strategy: compare CONSONANTS only. Consonant identity is context-stable, while
 * vowels legitimately shift by word ("a" is /æ/ in cat but /eɪ/ in cake), so a
 * vowel mismatch is not evidence of a hallucination. An override is plausible when
 * its consonant sequence is an in-order subsequence of the word's consonants. This
 * is pure and synchronous so it's unit-testable without touching Kokoro.
 */

/**
 * IPA / misaki consonant phonemes. Affricates are the SINGLE chars misaki emits
 * (ʧ, ʤ); the two-char IPA digraphs tʃ/dʒ — and ASCII r/g — are folded to the
 * misaki forms in {@link consonants} BEFORE this set is consulted, so only the
 * canonical chars (ɹ, ɡ, ʧ, ʤ) actually classify here. The ASCII `r`/`g` entries
 * are kept as harmless belt-and-suspenders. Vowels are intentionally absent.
 */
const CONSONANTS = new Set<string>([
  "p",
  "b",
  "t",
  "d",
  "k",
  "g",
  "ɡ",
  "f",
  "v",
  "θ",
  "ð",
  "s",
  "z",
  "ʃ",
  "ʒ",
  "h",
  "m",
  "n",
  "ŋ",
  "l",
  "r",
  "ɹ",
  "w",
  "j",
  "ʤ",
  "ʧ",
  "ɾ",
]);

/**
 * The ordered consonant phonemes in an IPA/misaki string. Normalizes notation so
 * the two sides compare on equal footing:
 *  - lowercases (misaki's flap `T` in "ciTy"/"buTTer" → /t/; uppercase vowels
 *    `A`/`I` become non-consonants and are correctly dropped),
 *  - folds affricate digraphs tʃ/dʒ → ʧ/ʤ so a two-char affricate counts once,
 *  - folds ASCII r → ɹ and ASCII g → ɡ. This is ESSENTIAL: misaki (lang "a")
 *    emits the rhotic `ɹ` and script-g `ɡ`, but an LLM asked for "IPA" almost
 *    always writes the colloquial ASCII `r`/`g`. Without this fold an override
 *    like "r" for "run" (ɹˈʌn) would fail the subsequence check and be wrongly
 *    dropped to bare — silently re-breaking the most common phonics tiles (r, g,
 *    r-controlled vowels, gr/br/fr blends).
 * Stress marks, length marks, and all vowels are ignored.
 */
function consonants(ipa: string): string[] {
  const folded = ipa
    .toLowerCase()
    .replace(/tʃ/g, "ʧ") // tʃ → ʧ
    .replace(/dʒ/g, "ʤ") // dʒ → ʤ
    .replace(/r/g, "ɹ") // ASCII r → misaki rhotic ɹ
    .replace(/g/g, "ɡ"); // ASCII g → misaki script-g ɡ
  const out: string[] = [];
  for (const ch of folded) {
    if (CONSONANTS.has(ch)) out.push(ch);
  }
  return out;
}

/** True if `needle` is an in-order (not necessarily contiguous) subsequence of `hay`. */
function isSubsequence(needle: readonly string[], hay: readonly string[]): boolean {
  let i = 0;
  for (const h of hay) {
    if (i < needle.length && needle[i] === h) i++;
  }
  return i === needle.length;
}

/**
 * Is `ipa` (an AI-proposed tile override) plausible for a word whose real
 * phonemes are `wordPhonemes`? True when the override's consonant sequence is an
 * in-order subsequence of the word's consonants. An override with NO consonants
 * (a pure vowel like "æ") is always plausible — there's nothing context-stable to
 * contradict. Order matters: out-of-order consonants fail.
 */
export function plausibleOverride(ipa: string, wordPhonemes: string): boolean {
  const want = consonants(ipa);
  if (want.length === 0) return true; // pure-vowel override: nothing to disprove
  return isSubsequence(want, consonants(wordPhonemes));
}

/**
 * Does `ipa` contain at least one consonant? Used by the GENERATED-content repair
 * to decide whether an override is even checkable: {@link plausibleOverride} can
 * only validate consonants (vowels vary by word and would false-reject), so a
 * pure-vowel override carries no evidence either way. The generated path treats
 * "uncheckable" as "drop" (fail-closed) — vowel tiles fall back to bare rather
 * than ship an unvalidated guess. Authored content keeps its verified vowels.
 */
export function hasConsonant(ipa: string): boolean {
  return consonants(ipa).length > 0;
}

/**
 * Which consonant phonemes each English grapheme can spell (American, in the same
 * folded notation {@link consonants} emits: ɹ ɡ ʤ ʧ etc.). Digraphs are listed so
 * they're matched before their letters. Only consonant outputs matter here; vowel
 * graphemes contribute none. Deliberately permissive per grapheme (e.g. c → k or s)
 * — the goal is to reject a phoneme the tile CAN'T spell, not to pin the one reading.
 */
const GRAPHEME_CONSONANTS: Record<string, readonly string[]> = {
  // digraphs (longest-match first)
  ch: ["ʧ", "k", "ʃ"], ck: ["k"], gh: ["ɡ", "f"], kn: ["n"], ng: ["ŋ", "ɡ"],
  ph: ["f"], qu: ["k", "w"], sh: ["ʃ"], th: ["θ", "ð"], wh: ["w", "h"], wr: ["ɹ"],
  // single letters
  b: ["b"], c: ["k", "s"], d: ["d"], f: ["f"], g: ["ɡ", "ʤ"], h: ["h"], j: ["ʤ"],
  k: ["k"], l: ["l"], m: ["m"], n: ["n", "ŋ"], p: ["p"], q: ["k"], r: ["ɹ"],
  s: ["s", "z", "ʃ", "ʒ"], t: ["t"], v: ["v"], w: ["w"], x: ["k", "s", "z", "ɡ"],
  y: ["j"], z: ["z"],
};

/** Every consonant phoneme the letters of `tile` can plausibly spell. */
function spellableConsonants(tile: string): Set<string> {
  const lower = tile.toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i < lower.length; ) {
    const digraph = GRAPHEME_CONSONANTS[lower.slice(i, i + 2)];
    if (digraph) {
      for (const p of digraph) out.add(p);
      i += 2;
      continue;
    }
    for (const p of GRAPHEME_CONSONANTS[lower[i]!] ?? []) out.add(p);
    i += 1; // vowels / unknown chars spell no consonant
  }
  return out;
}

/**
 * Is `ipa` compatible with `tile`'s OWN letters? Every consonant phoneme in the
 * override must be one the tile could spell ({@link spellableConsonants}). This is
 * the tile-aware guard {@link plausibleOverride} lacks: the latter only checks the
 * consonant is somewhere in the whole WORD, so it would wrongly accept a /t/
 * override on the vowel tile "a" of "cat" (/t/ is in "cat") or a /t/ on the "c"
 * tile (/t/ is in "cat", but "c" can't spell /t/). Both are rejected here. Vowels
 * are not constrained (a tile vowel legitimately ranges over many sounds).
 */
export function tileAllowsConsonants(tile: string, ipa: string): boolean {
  const spellable = spellableConsonants(tile);
  return consonants(ipa).every((c) => spellable.has(c));
}
