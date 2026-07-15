"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * The dictation half of the writing bridge (compose mode): the child speaks and
 * we transcribe via the Web Speech *recognition* API. It is the lowest-tax way
 * to get ideas down, but it is an *enhancement, never required* — when the
 * browser lacks recognition (Firefox, many mobile webviews) the hook reports
 * `supported: false` and the caller hides the affordance entirely.
 *
 * `SpeechRecognition` is not in lib.dom.d.ts (only its event/result types are),
 * so we declare the minimal instance + constructor shape here and narrow the
 * vendor-prefixed globals from `unknown` rather than reaching for `any`.
 */

/** The subset of the recognition instance we use. Reuses the lib.dom event type. */
interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type RecognitionConstructor = new () => RecognitionInstance;

/** Pull the (possibly vendor-prefixed) constructor off window without `any`. */
function getRecognitionCtor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as RecognitionConstructor) : null;
}

/** Recognition support never changes within a page, so the store is static
 *  (same pattern as useSpeech): server snapshot false, resolved on the client. */
function subscribeSupport(): () => void {
  return () => {};
}
function isRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/** Concatenate every final alternative in the result list into one string. */
function transcriptOf(event: SpeechRecognitionEvent): string {
  let out = "";
  const { results } = event;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.length > 0) out += result[0].transcript;
  }
  return out.trim();
}

export interface Dictation {
  /** True only when speech recognition exists in this browser. */
  supported: boolean;
  /** True while the mic is actively listening. */
  listening: boolean;
  /** Calm, child-facing fallback when recognition cannot start or continue. */
  message: string | null;
  /** Start a listening session; `onText` receives the recognized phrase. */
  start: (onText: (text: string) => void) => void;
  /** Stop listening now. */
  stop: () => void;
}

export function useDictation(lang = "en-US"): Dictation {
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const supported = useSyncExternalStore(subscribeSupport, isRecognitionSupported, () => false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // The browser may have ended the one-shot session between tap and stop.
    }
    setListening(false);
  }, []);

  const start = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setMessage("The microphone is not available here. You can type or ask a grown-up to write.");
        return;
      }
      recognitionRef.current?.abort();
      setMessage(null);

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const text = transcriptOf(event);
        if (text) onText(text);
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = () => {
        setListening(false);
        setMessage("The microphone needs a break. Your words are safe, and you can keep typing.");
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        setListening(false);
        setMessage("The microphone needs a break. Your words are safe, and you can keep typing.");
      }
    },
    [lang],
  );

  return { supported, listening, message, start, stop };
}
