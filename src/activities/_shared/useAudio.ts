"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { audioClipUrl } from "@/content/languages/audio";
import {
  audioPlaybackReducer,
  initialAudioPlaybackState,
  type AudioRequest,
  type AudioStatus,
} from "./audioState";
import { useSpeech } from "./useSpeech";
import type { SpeechPlaybackOutcome } from "./useSpeech";

export type AudioPlaybackOutcome = SpeechPlaybackOutcome;

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
  /** Bounded, child-facing availability state for the current request. */
  status: AudioStatus;
  /** Play `audioKey`'s clip if present, else speak `text`. Cancels anything in flight. */
  play: (
    opts: AudioRequest,
    handlers?: AudioPlaybackHandlers,
  ) => Promise<AudioPlaybackOutcome>;
  /** Replay the most recent request, including after an unavailable result. */
  retry: () => Promise<AudioPlaybackOutcome>;
  /** Stop the current clip and any speech. */
  stop: () => void;
  /** Backward-compatible alias for {@link stop}. */
  cancel: () => void;
}

/** Request-scoped media outcomes; superseded requests never invoke these handlers. */
export interface AudioPlaybackHandlers {
  onComplete?: () => void;
  onUnavailable?: () => void;
}

interface ActiveAudioRequest {
  id: number;
  handlers?: AudioPlaybackHandlers;
  resolve: (outcome: AudioPlaybackOutcome) => void;
}

export function useAudio(locale = "en-US"): AudioController {
  const speech = useSpeech(locale);
  const cancelSpeech = speech.cancel;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestRef = useRef<AudioRequest | null>(null);
  const lastHandlersRef = useRef<AudioPlaybackHandlers | undefined>(undefined);
  const lifecycleRef = useRef(0);
  const activeRequestRef = useRef<ActiveAudioRequest | null>(null);
  const [playback, dispatch] = useReducer(audioPlaybackReducer, initialAudioPlaybackState);

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

  const stopMedia = useCallback(() => {
    stopClip();
    cancelSpeech();
  }, [cancelSpeech, stopClip]);

  const settleRequest = useCallback((requestId: number, outcome: AudioPlaybackOutcome) => {
    const active = activeRequestRef.current;
    if (!active || active.id !== requestId) return;
    activeRequestRef.current = null;
    if (outcome === "completed") {
      dispatch({ type: "finished", requestId });
      active.handlers?.onComplete?.();
    } else if (outcome === "unavailable") {
      dispatch({ type: "unavailable", requestId });
      active.handlers?.onUnavailable?.();
    }
    active.resolve(outcome);
  }, []);

  const cancelActiveRequest = useCallback(() => {
    const active = activeRequestRef.current;
    activeRequestRef.current = null;
    active?.resolve("cancelled");
  }, []);

  const playRequest = useCallback(
    (request: AudioRequest, requestId: number) => {
      const { audioKey, text } = request;

      const fallBackToSpeech = (): void => {
        if (requestIdRef.current !== requestId) return;
        dispatch({ type: "fallback", requestId });
        void speech.speak(text).then((outcome) => settleRequest(requestId, outcome));
      };

      if (!audioKey || typeof Audio === "undefined") {
        fallBackToSpeech();
        return;
      }

      const el = new Audio(audioClipUrl(locale, audioKey));
      audioRef.current = el;
      // A missing/undecodable clip is expected (not every entry is pre-generated) —
      // fall back to TTS rather than surfacing an error.
      el.onerror = () => {
        // Only fall back when this element is still the current one — a play that
        // was already superseded by cancel()/a newer clip must stay silent.
        if (audioRef.current === el) {
          audioRef.current = null;
          fallBackToSpeech();
        }
      };
      el.onended = () => {
        if (audioRef.current === el) {
          audioRef.current = null;
          settleRequest(requestId, "completed");
        }
      };
      // play() can also reject (autoplay policy, load failure) → same fallback.
      void el.play().catch(() => {
        if (audioRef.current === el) {
          audioRef.current = null;
          fallBackToSpeech();
        }
      });
    },
    [locale, settleRequest, speech],
  );

  const play = useCallback(
    (request: AudioRequest, handlers?: AudioPlaybackHandlers): Promise<AudioPlaybackOutcome> => {
      requestIdRef.current += 1;
      cancelActiveRequest();
      stopMedia();
      const requestId = requestIdRef.current;
      lastRequestRef.current = request;
      lastHandlersRef.current = handlers;
      dispatch({ type: "play", requestId, request });
      return new Promise<AudioPlaybackOutcome>((resolve) => {
        activeRequestRef.current = { id: requestId, handlers, resolve };
        playRequest(request, requestId);
      });
    },
    [cancelActiveRequest, playRequest, stopMedia],
  );

  const retry = useCallback((): Promise<AudioPlaybackOutcome> => {
    const request = lastRequestRef.current;
    if (!request) return Promise.resolve("unavailable");
    requestIdRef.current += 1;
    cancelActiveRequest();
    stopMedia();
    const requestId = requestIdRef.current;
    dispatch({ type: "retry", requestId });
    const handlers = lastHandlersRef.current;
    return new Promise<AudioPlaybackOutcome>((resolve) => {
      activeRequestRef.current = { id: requestId, handlers, resolve };
      playRequest(request, requestId);
    });
  }, [cancelActiveRequest, playRequest, stopMedia]);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    cancelActiveRequest();
    stopMedia();
    dispatch({ type: "stop", requestId: requestIdRef.current });
  }, [cancelActiveRequest, stopMedia]);

  useEffect(() => {
    const lifecycle = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycle;
    return () => {
      // React development Strict Mode tears effects down and immediately starts
      // them again while preserving hook state. Defer final cleanup one microtask
      // so that synthetic teardown cannot cancel the one-shot lesson prompt; a
      // genuine unmount has no newer lifecycle and still stops every medium.
      queueMicrotask(() => {
        if (lifecycleRef.current !== lifecycle) return;
        requestIdRef.current += 1;
        cancelActiveRequest();
        stopMedia();
      });
    };
  }, [cancelActiveRequest, stopMedia]);

  // Return a stable controller so consumers' useCallback/effects that depend on
  // it don't churn every render. Members are stable primitives (from useSpeech)
  // or useCallbacks, so identity only changes when one truly does.
  return useMemo(
    () => ({
      supported: speech.supported,
      hasVoice: speech.hasVoice,
      status: playback.status,
      play,
      retry,
      stop,
      cancel: stop,
    }),
    [speech.supported, speech.hasVoice, playback.status, play, retry, stop],
  );
}
