"use client";

import { useCallback, useState } from "react";
import type { LangListenMatchConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { ChoiceGrid } from "../_shared/ChoiceGrid";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useActivity } from "../_shared/useActivity";
import { useAudio } from "../_shared/useAudio";
import { useMultipleChoice } from "../_shared/useMultipleChoice";
import { useEffectOncePerKey } from "../_shared/useSpeakOnce";
import { schema, score, type LangListenMatchResponse } from "./logic";

/**
 * Audio-first discrimination: the child hears a sound/word (big play button,
 * auto-played on each item) and taps the symbol or word that matches. Forgiving
 * — a wrong tap is data for the tutor, never a failure. Hybrid + locale-aware
 * audio via useAudio: a pre-recorded clip when present, else browser TTS.
 */
export function LangListenMatchPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<LangListenMatchConfig, LangListenMatchResponse>) {
  const parsed = useActivity(schema, config);
  const audio = useAudio(parsed.locale);

  const [done, setDone] = useState<LangListenMatchResponse | null>(null);

  const { step, picked, choose } = useMultipleChoice({
    count: parsed.items.length,
    voiceChoice: (i, itemIndex) => audio.play({ text: parsed.items[itemIndex].choices[i] }),
    onFinish: (answers) => setDone({ answers }),
  });

  const item = parsed.items[step];

  const play = useCallback(() => {
    audio.play({ audioKey: item.audioKey, text: item.spoken });
  }, [audio, item.audioKey, item.spoken]);

  // Auto-play the prompt once per item — keyed on the step so a re-render (or a
  // choice tap that voices the choice) can't clobber it with a prompt replay.
  useEffectOncePerKey(play, step);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="Great listening!"
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  return (
    <div className="grid gap-8">
      <p className="text-center text-lg text-ink-soft">{parsed.instruction}</p>

      <div className="flex justify-center">
        <SpeakerButton
          onSpeak={play}
          label="Play the sound again"
          size="lg"
          shape="round"
          tone="success"
        />
      </div>

      <ChoiceGrid
        choices={item.choices}
        answerIndex={item.answerIndex}
        picked={picked}
        onChoose={choose}
        labels={item.choiceLabels}
      />

      <ProgressHint>
        {step + 1} of {parsed.items.length}
      </ProgressHint>
    </div>
  );
}
