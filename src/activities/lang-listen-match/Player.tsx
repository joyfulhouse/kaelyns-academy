"use client";

import { useCallback, useState } from "react";
import type { LangListenMatchConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { AudioUnavailableNotice } from "../_shared/AudioUnavailableNotice";
import { ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { ChoiceGrid } from "../_shared/ChoiceGrid";
import { useActivity } from "../_shared/useActivity";
import { useAudio } from "../_shared/useAudio";
import { useEffectOncePerKey } from "../_shared/useSpeakOnce";
import { schema, type LangListenMatchResponse } from "./logic";
import {
  advanceListenMatch,
  chooseListenMatch,
  createListenMatchState,
  toggleListenHelp,
} from "./model";

/** Audio-first discrimination with retained, supported retry on every prompt. */
export function LangListenMatchPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<LangListenMatchConfig, LangListenMatchResponse>) {
  const parsed = useActivity(schema, config);
  const audio = useAudio(parsed.locale);
  const [state, setState] = useState(createListenMatchState);
  const item = parsed.items[state.step];

  const play = useCallback(() => {
    void audio.play({ audioKey: item.audioKey, text: item.spoken });
  }, [audio, item.audioKey, item.spoken]);

  useEffectOncePerKey(play, state.step, { essentialContentAudio: true });

  const choose = (choiceIndex: number): void => {
    if (audio.status !== "completed") return;
    setState((current) => chooseListenMatch(current, choiceIndex, item.answerIndex));
  };

  const advance = (): void => {
    const next = advanceListenMatch(state, parsed.items.length);
    if (next === state) return;
    audio.stop();
    if (next.completed) {
      onComplete({ items: next.results });
      return;
    }
    setState(next);
  };

  const labels = state.helpVisible ? item.choiceLabels : undefined;
  const hasHelp = Boolean(item.choiceLabels?.length);

  return (
    <div className="grid gap-7">
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

      {audio.status === "unavailable" ? (
        <AudioUnavailableNotice onRetry={audio.retry} />
      ) : null}

      {hasHelp ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setState(toggleListenHelp)}
            aria-pressed={state.helpVisible}
            className="min-h-11 rounded-full border-2 border-ink bg-honey/20 px-5 py-2 font-display text-ink transition active:translate-y-0.5"
          >
            {state.helpVisible ? "Hide sound help" : "Show sound help"}
          </button>
        </div>
      ) : null}

      <ChoiceGrid
        choices={item.choices}
        answerIndex={item.answerIndex}
        picked={state.picked}
        onChoose={choose}
        labels={labels}
        revealAnswer={state.feedback === "correct"}
        disabled={audio.status !== "completed" || state.feedback === "correct"}
      />

      <div className="grid min-h-20 place-items-center gap-3 text-center" aria-live="polite">
        {state.feedback === "try-again" ? (
          <p className="text-lg text-ink">Listen once more, then choose again.</p>
        ) : null}
        {state.feedback === "correct" ? (
          <>
            <p className="font-display text-xl text-ink">You found the sound!</p>
            <button
              type="button"
              onClick={advance}
              className="min-h-12 rounded-full border-[3px] border-ink bg-success/30 px-6 py-2 font-display text-lg text-ink shadow-pop transition active:translate-y-1 active:shadow-none"
            >
              {state.step + 1 === parsed.items.length ? "Finish" : "Next sound"}
            </button>
          </>
        ) : null}
      </div>

      <ProgressHint>
        {state.step + 1} of {parsed.items.length}
      </ProgressHint>
    </div>
  );
}
