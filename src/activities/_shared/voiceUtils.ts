/**
 * Pure helpers for locale-aware TTS voice selection and prosody. No React, no
 * DOM access at module load — safe to import anywhere (incl. tests) and to unit
 * test directly. `useSpeech` consumes these to pick the best installed voice and
 * tune rate/pitch per language (CJK reads a touch slower than English).
 */

/** Per-locale prosody. en-US is the fallback for anything unlisted. */
export const LOCALE_SPEECH_PARAMS: Record<string, { rate: number; pitch: number }> = {
  "en-US": { rate: 0.92, pitch: 1.05 }, // a touch slow for early ears
  "zh-TW": { rate: 0.78, pitch: 1.0 },
  "es-MX": { rate: 0.85, pitch: 1.05 },
  "ja-JP": { rate: 0.8, pitch: 1.0 },
  "ko-KR": { rate: 0.82, pitch: 1.0 },
};

const DEFAULT_PARAMS = LOCALE_SPEECH_PARAMS["en-US"];

/** Language prefix of a BCP-47 tag, lowercased ("zh-TW" → "zh"). */
function langPrefix(locale: string): string {
  return locale.toLowerCase().split("-")[0];
}

/** Prosody for a locale: exact tag, then language prefix, else the en-US default. */
export function speechParamsFor(locale: string): { rate: number; pitch: number } {
  const exact = LOCALE_SPEECH_PARAMS[locale];
  if (exact) return exact;
  const prefix = langPrefix(locale);
  for (const key of Object.keys(LOCALE_SPEECH_PARAMS)) {
    if (langPrefix(key) === prefix) return LOCALE_SPEECH_PARAMS[key];
  }
  return DEFAULT_PARAMS;
}

/**
 * Best installed voice for `locale`: an exact `voice.lang` match wins (preferring
 * the on-device `localService` voice for snappier, offline playback), then any
 * voice sharing the language prefix, else null (caller falls back to engine default).
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  locale: string,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const target = locale.toLowerCase();
  const exact = voices.filter((v) => v.lang.toLowerCase() === target);
  if (exact.length > 0) {
    return exact.find((v) => v.localService) ?? exact[0];
  }
  const prefix = langPrefix(locale);
  const byPrefix = voices.filter((v) => langPrefix(v.lang) === prefix);
  if (byPrefix.length > 0) {
    return byPrefix.find((v) => v.localService) ?? byPrefix[0];
  }
  return null;
}
