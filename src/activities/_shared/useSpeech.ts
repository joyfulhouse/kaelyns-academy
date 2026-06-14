"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  /** True only when speechSynthesis exists in this browser. */
  supported: boolean;
  /**
   * True when this locale can actually be voiced: English is ubiquitous so we
   * assume yes; a non-English locale is only true once a matching voice loads.
   */
  hasVoice: boolean;
  /** Speak a phrase (cancels anything in flight). No-op when unsupported. */
  speak: (text: string) => void;
  /** Stop any current utterance. */
  cancel: () => void;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

/** speechSynthesis support never changes within a page, so the store is static. */
function subscribe(): () => void {
  return () => {};
}
function isSupported(): boolean {
  return getSynth() !== null && typeof window !== "undefined" && "SpeechSynthesisUtterance" in window;
}

/** English voices ship with every engine, so non-English is the only "might be missing" case. */
function isEnglish(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

export function useSpeech(locale = "en-US"): SpeechController {
  const supported = useSyncExternalStore(subscribe, isSupported, () => false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // English is assumed available; for other locales we flip true only once a
  // matching voice resolves (drives whether callers offer that language's audio).
  const [hasVoice, setHasVoice] = useState(() => isEnglish(locale));

  useEffect(() => {
    const synth = getSynth();
    synthRef.current = synth;
    if (!synth) return;

    // Re-read the voice list and resolve the best match for the current locale.
    const refresh = (): void => {
      voicesRef.current = synth.getVoices();
      const match = pickVoice(voicesRef.current, locale);
      voiceRef.current = match;
      setHasVoice(isEnglish(locale) || match !== null);
    };

    refresh(); // list may already be populated (Safari/Firefox)
    synth.addEventListener("voiceschanged", refresh); // Chrome populates async
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
      synth.cancel();
    };
  }, [locale]);

  const speak = useCallback(
    (text: string) => {
      const synth = synthRef.current ?? getSynth();
      if (!synth || typeof window === "undefined" || !("SpeechSynthesisUtterance" in window)) {
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      const voice = voiceRef.current ?? pickVoice(synth.getVoices(), locale);
      if (voice) utterance.voice = voice;
      utterance.lang = locale;
      const { rate, pitch } = speechParamsFor(locale);
      utterance.rate = rate;
      utterance.pitch = pitch;
      synth.speak(utterance);
    },
    [locale],
  );

  const cancel = useCallback(() => {
    (synthRef.current ?? getSynth())?.cancel();
  }, []);

  return { supported, hasVoice, speak, cancel };
}
