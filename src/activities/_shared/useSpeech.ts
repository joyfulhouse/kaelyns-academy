"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type NarrateHandle, narrate } from "@/components/learner/narrate";
import { captureNonCritical } from "@/lib/capture";
import { type SpeakOptions, routeSpeak } from "./speechRouting";
import { pickVoice, speechParamsFor } from "./voiceUtils";

/**
 * Web Speech API wrapper for the audio-first kid surface (PRODUCT.md §1: design
 * for the ear). TTS is an *enhancement, never required* — every caller still
 * shows a visible tappable speaker. Guarded for SSR and unavailable engines.
 *
 * Locale-aware: picks the best installed voice for `locale` (see `pickVoice`)
 * and tunes rate/pitch per language. Chrome populates voices asynchronously, so
 * we also resolve on the `voiceschanged` event, not just first paint.
 */
export interface SpeechController {
  /** True when this locale has a usable neural or browser speech path. */
  supported: boolean;
  /**
   * True when this locale can actually be voiced: English is ubiquitous so we
   * assume yes; a non-English locale is only true once a matching voice loads.
   */
  hasVoice: boolean;
  /** Speak a phrase (cancels anything in flight). Resolves with actual delivery,
   *  unavailability, or cancellation. The optional `tts` override sends phoneme
   *  markup to the neural voice only; browser synthesis always gets plain text. */
  speak: (text: string, opts?: SpeakOptions) => Promise<SpeechPlaybackOutcome>;
  /** Stop any current utterance. */
  cancel: () => void;
}

/** A request settles only after delivery ends, fails, or is explicitly superseded. */
export type SpeechPlaybackOutcome = "completed" | "unavailable" | "cancelled";

interface ActiveSpeechRequest {
  id: number;
  resolve: (outcome: SpeechPlaybackOutcome) => void;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

/** Browser media capabilities do not change within a page, so the store is static. */
function subscribe(): () => void {
  return () => {};
}
function hasSynth(): boolean {
  return getSynth() !== null && typeof SpeechSynthesisUtterance === "function";
}

/** English voices ship with every engine, so non-English is the only "might be missing" case. */
function isEnglish(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

function hasNeuralAudio(): boolean {
  return typeof window !== "undefined" && typeof Audio === "function";
}

function hasPlaybackPath(locale: string): boolean {
  return isEnglish(locale) ? hasNeuralAudio() || hasSynth() : hasSynth();
}

export function useSpeech(locale = "en-US"): SpeechController {
  const supported = useSyncExternalStore(
    subscribe,
    () => hasPlaybackPath(locale),
    () => false,
  );
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const narrateRef = useRef<NarrateHandle | null>(null);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef<ActiveSpeechRequest | null>(null);
  const lifecycleRef = useRef(0);
  const lifecycleLocaleRef = useRef(locale);
  // English is assumed available; for other locales we flip true only once a
  // matching voice resolves (drives whether callers offer that language's audio).
  const [hasVoice, setHasVoice] = useState(() => isEnglish(locale));

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    const active = activeRequestRef.current;
    activeRequestRef.current = null;
    active?.resolve("cancelled");
    narrateRef.current?.cancel();
    narrateRef.current = null;
    (synthRef.current ?? getSynth())?.cancel();
  }, []);

  useEffect(() => {
    const lifecycle = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycle;
    lifecycleLocaleRef.current = locale;
    const synth = getSynth();
    synthRef.current = synth;

    // Re-read the voice list and resolve the best match for the current locale.
    const refresh = (): void => {
      if (!synth) {
        voiceRef.current = null;
        setHasVoice(isEnglish(locale));
        return;
      }
      voicesRef.current = synth.getVoices();
      const match = pickVoice(voicesRef.current, locale);
      voiceRef.current = match;
      setHasVoice(isEnglish(locale) || match !== null);
    };

    refresh(); // list may already be populated (Safari/Firefox)
    synth?.addEventListener("voiceschanged", refresh); // Chrome populates async
    return () => {
      synth?.removeEventListener("voiceschanged", refresh);
      const requestId = requestIdRef.current;
      queueMicrotask(() => {
        const remountedSameLocale =
          lifecycleRef.current !== lifecycle && lifecycleLocaleRef.current === locale;
        if (remountedSameLocale || requestIdRef.current !== requestId) return;
        cancel();
      });
    };
  }, [cancel, locale]);

  const speakViaSynth = useCallback(
    (text: string, callbacks?: {
      onComplete: () => void;
      onUnavailable: () => void;
    }) => {
      const synth = synthRef.current ?? getSynth();
      if (!synth || typeof window === "undefined" || !("SpeechSynthesisUtterance" in window)) {
        callbacks?.onUnavailable();
        return;
      }
      try {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = voiceRef.current ?? pickVoice(synth.getVoices(), locale);
        if (voice) utterance.voice = voice;
        utterance.lang = locale;
        const { rate, pitch } = speechParamsFor(locale);
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.onend = () => callbacks?.onComplete();
        utterance.onerror = () => callbacks?.onUnavailable();
        synth.speak(utterance);
      } catch (error) {
        captureNonCritical("Speech synthesis failed", error);
        callbacks?.onUnavailable();
      }
    },
    [locale],
  );

  const speak = useCallback(
    (text: string, opts?: SpeakOptions): Promise<SpeechPlaybackOutcome> => {
      cancel();
      const trimmed = text.trim();
      const english = isEnglish(locale);
      const synth = getSynth();
      let liveVoice = voiceRef.current;
      if (!english) {
        try {
          liveVoice = synth ? pickVoice(synth.getVoices(), locale) : null;
        } catch (error) {
          captureNonCritical("Speech synthesis failed", error);
          return Promise.resolve("unavailable");
        }
      }
      const liveSupported = hasPlaybackPath(locale);
      const liveHasVoice = english || liveVoice !== null;
      if (!liveSupported || !liveHasVoice || !trimmed) {
        return Promise.resolve("unavailable");
      }
      voiceRef.current = liveVoice;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      return new Promise<SpeechPlaybackOutcome>((resolve) => {
        activeRequestRef.current = { id: requestId, resolve };
        const settle = (outcome: SpeechPlaybackOutcome): void => {
          if (activeRequestRef.current?.id !== requestId) return;
          activeRequestRef.current = null;
          narrateRef.current = null;
          resolve(outcome);
        };
        // TTS is an enhancement, never required (PRODUCT.md §1). A synchronous throw
        // anywhere in the synth/neural path (new SpeechSynthesisUtterance, routeSpeak,
        // etc.) must never escape into a caller's render or click handler — guarding
        // here keeps EVERY invocation safe (the speaker button, auto-read on mount,
        // and activity callers alike). The prompt text stays visible regardless.
        try {
          const handle = routeSpeak(
            locale,
            text,
            { narrate, speakViaSynth },
            opts,
            {
              onComplete: () => settle("completed"),
              onUnavailable: () => settle("unavailable"),
            },
          );
          if (activeRequestRef.current?.id === requestId) narrateRef.current = handle;
          else handle?.cancel();
        } catch (error) {
          narrateRef.current = null;
          captureNonCritical("Speech synthesis failed", error);
          settle("unavailable");
        }
      });
    },
    [cancel, locale, speakViaSynth],
  );

  // Return a stable controller so consumers' useCallback/effects that depend on
  // it don't churn every render. Every member is itself stable (store/state/
  // useCallback), so the object identity only changes when one truly does.
  return useMemo(
    () => ({ supported, hasVoice, speak, cancel }),
    [supported, hasVoice, speak, cancel],
  );
}
