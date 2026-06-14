"use client";

import { useCallback, useEffect, useRef } from "react";
import { audioClipUrl } from "@/content/languages/audio";
import { useSpeech } from "./useSpeech";

/**
 * Hybrid audio: play a pre-generated clip when one exists, else fall back to
 * locale-aware browser TTS. Canonical entries carry an `audioKey` (= clip id);
 * we optimistically load `{AUDIO_BASE_URL}/{locale}/{audioKey}.m4a` and, if the
 * element errors (404 / decode failure), speak the entry's text instead. No
 * manifest fetch — the `<audio>` error event is the single, robust signal.
 */
export interface AudioController {
  /** Underlying speech engine exists (clips can still play without it). */
  supported: boolean;
  /** A matching TTS voice for this locale is available (see `useSpeech`). */
  hasVoice: boolean;
  /** Play `audioKey`'s clip if present, else speak `text`. Cancels anything in flight. */
  play: (opts: { audioKey?: string; text: string }) => void;
  /** Stop the current clip and any speech. */
  cancel: () => void;
}

export function useAudio(locale = "en-US"): AudioController {
  const speech = useSpeech(locale);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop and detach any in-flight clip (also clears its listeners via .onerror/.onended).
  const stopClip = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.onerror = null;
      el.onended = null;
      el.pause();
      audioRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    stopClip();
    speech.cancel();
  }, [stopClip, speech]);

  const play = useCallback(
    ({ audioKey, text }: { audioKey?: string; text: string }) => {
      cancel(); // new play supersedes anything already sounding
      if (!audioKey || typeof window === "undefined") {
        speech.speak(text);
        return;
      }
      const el = new Audio(audioClipUrl(locale, audioKey));
      audioRef.current = el;
      // A missing/undecodable clip is expected (not every entry is pre-generated) —
      // fall back to TTS rather than surfacing an error.
      el.onerror = () => {
        if (audioRef.current === el) audioRef.current = null;
        speech.speak(text);
      };
      el.onended = () => {
        if (audioRef.current === el) audioRef.current = null;
      };
      // play() can also reject (autoplay policy, load failure) → same fallback.
      void el.play().catch(() => {
        if (audioRef.current === el) {
          audioRef.current = null;
          speech.speak(text);
        }
      });
    },
    [cancel, locale, speech],
  );

  useEffect(() => stopClip, [stopClip]); // stop the clip on unmount

  return { supported: speech.supported, hasVoice: speech.hasVoice, play, cancel };
}
