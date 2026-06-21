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
 * (ʧ, ʤ); we fold the two-char IPA digraphs tʃ/dʒ to them before scanning. Both
 * `g` and `ɡ` (ASCII g and IPA script-g U+0261) and both `r` and `ɹ` are included
 * so either notation classifies. Vowels are intentionally absent.
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
