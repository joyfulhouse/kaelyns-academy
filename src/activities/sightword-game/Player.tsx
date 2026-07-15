"use client";

import { useMemo, useState } from "react";
import { EarIcon } from "@phosphor-icons/react/dist/ssr";
import type { SightwordGameConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { shuffle } from "../_shared/shuffle";
import { useActivity } from "../_shared/useActivity";
import { useEffectOncePerKey } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import {
  normalizeSightwordRounds,
  schema,
  type SightwordGameResponse,
} from "./logic";

interface ChoiceCard {
  choiceIndex: number;
  text: string;
}

export function SightwordGamePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<SightwordGameConfig, SightwordGameResponse>) {
  const parsed = useActivity(schema, config);
  const rounds = useMemo(() => normalizeSightwordRounds(parsed), [parsed]);
  const speech = useSpeech();
  const [roundIndex, setRoundIndex] = useState(0);
  const [attempts, setAttempts] = useState(1);
  const [completedRounds, setCompletedRounds] = useState<SightwordGameResponse["rounds"]>([]);
  const [wrongChoiceIndexes, setWrongChoiceIndexes] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const round = rounds[roundIndex];
  const cards = useMemo<ChoiceCard[]>(() => {
    if (!round) return [];
    const indexed = round.choices.map((text, choiceIndex) => ({ text, choiceIndex }));
    const seed = [...round.target].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return shuffle(indexed, seed + roundIndex * 17);
  }, [round, roundIndex]);
  const spokenCue = round?.spokenPrompt ?? round?.target ?? "";

  useEffectOncePerKey(
    () => {
      if (spokenCue) speech.speak(spokenCue);
    },
    roundIndex,
  );

  if (!round) return null;

  function choose(choiceIndex: number): void {
    const choice = round.choices[choiceIndex];
    if (choice === undefined) return;
    const correct = choice.toLocaleLowerCase() === round.target.toLocaleLowerCase();
    if (!correct) {
      setAttempts((value) => Math.min(20, value + 1));
      setWrongChoiceIndexes((previous) =>
        previous.includes(choiceIndex) ? previous : [...previous, choiceIndex],
      );
      setFeedback("Keep that card here. Listen once more and try again.");
      speech.speak("Listen once more and try again.");
      return;
    }

    const result = { roundIndex, choiceIndex, attempts };
    const nextCompleted = [...completedRounds, result];
    const isLast = roundIndex === rounds.length - 1;
    if (isLast) {
      onComplete({ rounds: nextCompleted });
      return;
    }
    setCompletedRounds(nextCompleted);
    setRoundIndex((index) => index + 1);
    setAttempts(1);
    setWrongChoiceIndexes([]);
    setFeedback(null);
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <ProgressHint>
        Word {roundIndex + 1} of {rounds.length}
      </ProgressHint>

      <section className="mx-auto grid w-full max-w-2xl gap-5 rounded-[2rem] border-[3px] border-ink bg-paper-sunk p-5 shadow-pop sm:p-7">
        <div className="grid justify-items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-full border-[3px] border-ink bg-honey shadow-pop">
            <EarIcon size={30} weight="bold" aria-hidden="true" />
          </span>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-soft">Listen, then find</p>
          <p className="font-display text-4xl text-ink">Target word: {round.target}</p>
          {round.context && (
            <p className="max-w-xl rounded-xl bg-paper-raised px-4 py-3 text-lg text-ink">
              {round.context}
            </p>
          )}
          <SpeakerButton
            speech={speech}
            text={spokenCue}
            label={`Hear target ${round.target}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Word choices">
          {cards.map((card) => {
            const tried = wrongChoiceIndexes.includes(card.choiceIndex);
            return (
              <button
                key={card.choiceIndex}
                type="button"
                onClick={() => choose(card.choiceIndex)}
                aria-pressed={tried}
                className={cn(
                  "min-h-24 rounded-2xl border-[3px] border-ink px-4 py-5 font-display text-2xl text-ink shadow-pop",
                  "transition duration-150 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-honey/60 active:translate-y-1 active:shadow-none",
                  tried ? "bg-honey" : "bg-paper-raised",
                )}
              >
                {card.text}
              </button>
            );
          })}
        </div>
      </section>

      <div className="min-h-7 text-center" aria-live="polite" aria-atomic="true">
        {feedback && <p className="font-display text-lg text-ink">{feedback}</p>}
      </div>
    </div>
  );
}
