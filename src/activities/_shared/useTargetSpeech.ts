"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { SpeechController } from "./useSpeech";

/**
 * Tracks delivery for one activity's target cue, independently from instruction,
 * correction, or tile speech that shares the same SpeechController.
 */
export function useTargetSpeech(speech: SpeechController) {
  const [unavailable, setUnavailable] = useState(false);
  const requestIdRef = useRef(0);

  const speakTarget = useCallback<SpeechController["speak"]>(
    async (text, options) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const outcome = await speech.speak(text, options);
      if (requestIdRef.current === requestId && outcome !== "cancelled") {
        setUnavailable(outcome === "unavailable");
      }
      return outcome;
    },
    [speech],
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setUnavailable(false);
  }, []);

  return useMemo(
    () => ({ unavailable, speakTarget, reset }),
    [reset, speakTarget, unavailable],
  );
}
