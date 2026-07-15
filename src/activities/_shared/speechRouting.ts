import type {
  NarrateHandle,
  NarrateOptions,
  Persist,
} from "@/components/learner/narrate";

/** English locales get the Kokoro neural voice; everything else uses browser TTS. */
export function isEnglishLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

/** The learner's base (UI) language: on-screen instructions/prompts are authored in it. */
export const BASE_LOCALE = "en-US";

/**
 * A world-language activity mixes two languages: its on-screen *instructions*
 * are written in the learner's base language (English) while its *content* —
 * the symbols, spoken words, and answer choices — is in the target language.
 * Each must be voiced in the language it's actually written in. Voicing an
 * English instruction with the target-language TTS (e.g. reading "Tap each one
 * to hear it" with the Korean voice) mangles the pronunciation, so instructions
 * resolve to {@link BASE_LOCALE} and only content uses the target locale.
 */
export function localeForRole(targetLocale: string, role: "instruction" | "content"): string {
  return role === "instruction" ? BASE_LOCALE : targetLocale;
}

export interface SpeakRouter {
  narrate: (
    text: string,
    opts: NarrateOptions & { persist: Persist },
  ) => NarrateHandle;
  speakViaSynth: (text: string, callbacks?: SpeechPlaybackCallbacks) => void;
}

/** Low-level delivery callbacks used to settle a request exactly once. */
export interface SpeechPlaybackCallbacks {
  onComplete: () => void;
  onUnavailable: () => void;
}

/**
 * Per-utterance options. `tts` overrides the text sent to the *neural* (Kokoro)
 * voice — e.g. an inline phoneme string from {@link withPhonemes} so an isolated
 * phonics tile voices correctly. The browser-synth fallback always speaks the
 * plain `text`, never this, because Web Speech can't read the phoneme markup.
 */
export interface SpeakOptions {
  tts?: string;
}

/**
 * Decide how to voice `text` for `locale`: English → Kokoro narrate (with synth
 * fallback), any other locale → browser speechSynthesis (foreign clips are handled
 * separately by useAudio). Returns the cancelable narrate handle for English, or
 * null (non-English / empty text). When `opts.tts` is set, the neural voice gets
 * that override while the synth fallback keeps the plain `text`.
 */
export function routeSpeak(
  locale: string,
  text: string,
  router: SpeakRouter,
  opts?: SpeakOptions,
  callbacks?: SpeechPlaybackCallbacks,
): NarrateHandle | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const neural = opts?.tts?.trim() || trimmed;
  const speakViaSynth = (): void => {
    if (callbacks) router.speakViaSynth(trimmed, callbacks);
    else router.speakViaSynth(trimmed);
  };
  if (isEnglishLocale(locale)) {
    return router.narrate(neural, {
      persist: "durable",
      onComplete: callbacks?.onComplete,
      onUnavailable: speakViaSynth,
    });
  }
  speakViaSynth();
  return null;
}
