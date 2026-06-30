"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

/**
 * The multiple-choice answer grid shared by the audio Players: a responsive grid
 * of big tappable cards. Once a choice is `picked` the grid reveals — the correct
 * card lifts to success, the others dim, and a check lands on the answer — and
 * all cards lock (the parent's reveal→advance timer moves on). Optional per-choice
 * `labels` render a romanization under the glyph and fold into the aria-label.
 */
export function ChoiceGrid({
  choices,
  answerIndex,
  picked,
  onChoose,
  labels,
}: {
  choices: string[];
  answerIndex: number;
  picked: number | null;
  onChoose: (choiceIndex: number) => void;
  labels?: (string | undefined)[];
}) {
  const reveal = picked !== null;
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
      {choices.map((choice, i) => {
        const isPicked = picked === i;
        const isAnswer = i === answerIndex;
        const label = labels?.[i];
        return (
          <button
            key={`${choice}-${i}`}
            type="button"
            onClick={() => onChoose(i)}
            disabled={reveal}
            aria-label={label ? `${choice}, ${label}` : choice}
            className={cn(
              "relative grid min-h-28 place-items-center gap-1 rounded-2xl border-[3px] border-ink px-4 py-5 text-ink shadow-pop transition duration-200 ease-out",
              !reveal && "bg-paper-raised hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              reveal && isAnswer && "bg-success/30",
              reveal && !isAnswer && "bg-paper-raised opacity-60",
              reveal && isPicked && !isAnswer && "opacity-100",
            )}
          >
            <span className="font-display text-4xl">{choice}</span>
            {label ? <span className="text-sm text-ink-soft">{label}</span> : null}
            {reveal && isAnswer && (
              <CheckCircleIcon
                size={26}
                weight="fill"
                aria-hidden="true"
                className="absolute right-2 top-2 text-success"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
