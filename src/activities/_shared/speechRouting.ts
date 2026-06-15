import type { NarrateHandle, Persist } from "@/components/learner/narrate";

/** English locales get the Kokoro neural voice; everything else uses browser TTS. */
export function isEnglishLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

export interface SpeakRouter {
  narrate: (text: string, opts: { persist: Persist; onUnavailable: () => void }) => NarrateHandle;
  speakViaSynth: (text: string) => void;
}

/**
 * Decide how to voice `text` for `locale`: English → Kokoro narrate (with synth
 * fallback), any other locale → browser speechSynthesis (foreign clips are handled
 * separately by useAudio). Returns the cancelable narrate handle for English, or
 * null (non-English / empty text).
 */
export function routeSpeak(locale: string, text: string, router: SpeakRouter): NarrateHandle | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isEnglishLocale(locale)) {
    return router.narrate(trimmed, {
      persist: "durable",
      onUnavailable: () => router.speakViaSynth(trimmed),
    });
  }
  router.speakViaSynth(trimmed);
  return null;
}
