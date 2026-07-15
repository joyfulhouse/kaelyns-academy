"use client";

import type { OralReadingPresentation } from "@/content/activity-configs";
import { Button } from "@/components/ui/Button";
import { SpeakerButton } from "../_shared/ActivityChrome";
import { canExposeModelAudio } from "./recording";

export function OralModelStep({
  presentation,
  speechSupported,
  modelStatus,
  label,
  onPlay,
}: {
  presentation: OralReadingPresentation;
  speechSupported: boolean;
  modelStatus: "idle" | "playing" | "completed";
  label: string;
  onPlay: () => void;
}) {
  if (!speechSupported || !canExposeModelAudio(presentation)) {
    return null;
  }

  return (
    <div className="grid justify-items-center gap-3 rounded-2xl border-[3px] border-ink/15 bg-paper-sunk p-4">
      <p className="font-display text-lg text-ink">Step 1: Listen to the model</p>
      <SpeakerButton onSpeak={onPlay} label={label} size="lg" shape="round" />
      <p className="text-sm text-ink-soft" role="status" aria-live="polite">
        {modelStatus === "completed"
          ? "The model finished. Now it is your turn."
          : modelStatus === "playing"
            ? "Listening to the whole model…"
            : "Listen once, then read it back."}
      </p>
    </div>
  );
}

export function ModeledAudioFallback({ onComplete }: { onComplete: () => void }) {
  return (
    <div
      role="status"
      className="grid gap-4 rounded-3xl border-[3px] border-ink bg-honey/30 p-6"
    >
      <h2 className="font-display text-2xl text-ink">The model audio is not available.</h2>
      <p className="text-ink-soft">
        Ask a grown-up to read it once, then read it back together. This is practice only.
      </p>
      <div className="flex justify-center">
        <Button size="kid" variant="honey" onClick={onComplete}>
          A grown-up read it with me
        </Button>
      </div>
    </div>
  );
}
