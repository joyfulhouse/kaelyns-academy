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
  const cleaned = ipa.trim().replace(MARKUP_DELIMITERS, "");
  return cleaned ? `[${label}](/${cleaned}/)` : label;
}

/** The neural-TTS text for a phonics tile: the wrapped IPA override when the
 *  activity authored one for `tile`, else `undefined` so the caller speaks the
 *  bare tile through default G2P. Robust to untrusted `say` maps. */
export function tilePhonemeText(
  tile: string,
  say: Record<string, string> | undefined,
): string | undefined {
  const ipa = say?.[tile];
  return typeof ipa === "string" && ipa.trim() ? withPhonemes(tile, ipa) : undefined;
}
