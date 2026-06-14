"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/ssr";
import type { LangListenMatchConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useAudio } from "../_shared/useAudio";
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
  const parsed = useMemo(() => schema.parse(config), [config]);
  const audio = useAudio(parsed.locale);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState<LangListenMatchResponse | null>(null);

  const item = parsed.items[step];

  const play = useCallback(() => {
    audio.play({ audioKey: item.audioKey, text: item.spoken });
  }, [audio, item.audioKey, item.spoken]);

  // Auto-play the prompt when a new item appears.
  useEffect(() => {
    play();
  }, [play]);

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

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const nextAnswers = [...answers, i];
    audio.play({ text: parsed.items[step].choices[i] });
    window.setTimeout(() => {
      if (step + 1 >= parsed.items.length) {
        setDone({ answers: nextAnswers });
      } else {
        setAnswers(nextAnswers);
        setStep(step + 1);
        setPicked(null);
      }
    }, 650);
  }

  const reveal = picked !== null;

  return (
    <div className="grid gap-8">
      <p className="text-center text-lg text-ink-soft">{parsed.instruction}</p>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={play}
          aria-label="Play the sound again"
          className="grid size-28 place-items-center rounded-full border-[3px] border-ink bg-success/25 text-ink shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
        >
          <SpeakerHighIcon size={56} weight="fill" aria-hidden="true" />
        </button>
      </div>

      <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {item.choices.map((c, i) => {
          const isPicked = picked === i;
          const isAnswer = i === item.answerIndex;
          const label = item.choiceLabels?.[i];
          return (
            <button
              key={`${c}-${i}`}
              type="button"
              onClick={() => choose(i)}
              disabled={reveal}
              aria-label={label ? `${c}, ${label}` : c}
              className={cn(
                "grid min-h-28 place-items-center gap-1 rounded-2xl border-[3px] border-ink px-4 py-5 text-ink shadow-pop transition duration-200 ease-out",
                !reveal && "bg-paper-raised hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                reveal && isAnswer && "bg-success/30",
                reveal && !isAnswer && "bg-paper-raised opacity-60",
                reveal && isPicked && !isAnswer && "opacity-100",
              )}
            >
              <span className="font-display text-4xl">{c}</span>
              {label ? <span className="text-sm text-ink-soft">{label}</span> : null}
            </button>
          );
        })}
      </div>

      <p className="text-center text-sm text-ink-soft" aria-live="polite">
        {step + 1} of {parsed.items.length}
      </p>
    </div>
  );
}
