// src/lib/audio/phonemes.ts
/**
 * Inline phoneme overrides for the Kokoro/misaki G2P frontend.
 *
 * Wrapping spoken text as `[label](/ipa/)` makes Kokoro voice the supplied IPA
 * verbatim instead of guessing pronunciation from the spelling. This is required
 * for phonics tiles, which are spoken in ISOLATION: an out-of-context fragment
 * mis-phonemizes (a lone "ble" → "blee", "ta" → "tah", "ger" → soft-g "jer"),
 * because the letters alone don't carry the word's vowel quality or stress. The
 * deployed kokoro-fastapi honors this markup in the /v1/audio/speech `input`.
 *
 * Imported by BOTH the client Player and the server warm-pass extractor so the
 * exact string — and therefore its `ttsKey` cache key — matches on both sides.
 */

/** The markup delimiters of an inline override: `[ ] ( ) /`. misaki IPA never
 *  contains them, so we strip any that slip in from authored or AI-generated
 *  content — a stray one would break `[label](/…/)` or inject extra tokens. */
const MARKUP_DELIMITERS = /[[\]()/]+/g;

/** Wrap `label` so the neural voice pronounces `ipa`
 *  (`withPhonemes("ta", "tˈA") === "[ta](/tˈA/)"`). Tolerates author-supplied
 *  surrounding slashes/whitespace and sanitizes markup delimiters; returns the
 *  bare label when `ipa` is blank so we never emit broken markup. */
export function withPhonemes(label: string, ipa: string): string {
  // Sanitize BOTH sides: a markup delimiter in the label OR the IPA would
  // break/escape the `[label](/ipa/)` wrapper. Authored content has none; this
  // guards AI-generated tiles/words, which also flow through here.
  const cleanedLabel = label.replace(MARKUP_DELIMITERS, "");
  const cleanedIpa = ipa.trim().replace(MARKUP_DELIMITERS, "");
  return cleanedIpa ? `[${cleanedLabel}](/${cleanedIpa}/)` : cleanedLabel;
}

/** The neural-TTS text for a spoken `label`: the wrapped IPA override when `ipa`
 *  is a non-blank string, else `undefined` so the caller speaks `label` bare
 *  through default G2P. Robust to untrusted/missing `ipa`. The single source of
 *  the override decision shared by the Player and the warm-pass, so both emit the
 *  byte-identical string (and therefore the same `ttsKey`). */
export function wordPhonemeText(label: string, ipa: unknown): string | undefined {
  return typeof ipa === "string" && ipa.trim() ? withPhonemes(label, ipa) : undefined;
}

/** As {@link wordPhonemeText}, but looks the override up in an activity's `say`
 *  map by tile. */
export function tilePhonemeText(
  tile: string,
  say: Record<string, string> | undefined,
): string | undefined {
  return wordPhonemeText(tile, say?.[tile]);
}
