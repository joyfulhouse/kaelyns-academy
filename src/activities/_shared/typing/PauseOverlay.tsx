"use client";

import { useEffect } from "react";
import { PauseIcon } from "@phosphor-icons/react/dist/ssr";
import { useSpeakOnce } from "../useSpeakOnce";
import { useSpeech } from "../useSpeech";
import { useDocumentHidden } from "./roundPause";

const PAUSE_MESSAGE = "Paused — click to keep playing";

/**
 * The click-to-resume overlay shared by every timed typing round (Star
 * Catch, Rocket Race): speaks PAUSE_MESSAGE once per pause episode, silenced
 * while the tab itself is hidden (nobody is looking at the overlay to hear it).
 */
export function PauseOverlay({
  paused,
  onResume,
}: {
  paused: boolean;
  onResume: () => void;
}) {
  const speech = useSpeech();
  const cancelSpeech = speech.cancel;
  const hidden = useDocumentHidden();
  useSpeakOnce(speech.speak, paused && !hidden ? PAUSE_MESSAGE : null);

  useEffect(
    () => () => {
      cancelSpeech();
    },
    [cancelSpeech],
  );

  if (!paused) return null;
  return (
    <button
      type="button"
      onClick={() => {
        cancelSpeech();
        onResume();
      }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-honey bg-paper/95 px-6 text-center text-xl font-semibold text-ink shadow-lg"
    >
      <PauseIcon size={72} weight="fill" className="text-honey-deep" aria-hidden />
      <span>{PAUSE_MESSAGE}</span>
    </button>
  );
}
