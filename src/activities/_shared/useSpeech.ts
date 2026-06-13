"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Web Speech API wrapper for the audio-first kid surface (PRODUCT.md §1: design
 * for the ear). TTS is an *enhancement, never required* — every caller still
 * shows a visible tappable speaker. Guarded for SSR and unavailable engines.
 */
export interface SpeechController {
  /** True only when speechSynthesis exists in this browser. */
  supported: boolean;
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

export function useSpeech(): SpeechController {
  const supported = useSyncExternalStore(subscribe, isSupported, () => false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    synthRef.current = getSynth();
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    const synth = synthRef.current ?? getSynth();
    if (!synth || typeof window === "undefined" || !("SpeechSynthesisUtterance" in window)) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = 0.92; // a touch slow for early ears
    utterance.pitch = 1.05;
    synth.speak(utterance);
  }, []);

  const cancel = useCallback(() => {
    (synthRef.current ?? getSynth())?.cancel();
  }, []);

  return { supported, speak, cancel };
}
