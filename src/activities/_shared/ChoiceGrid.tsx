"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

/**
 * The multiple-choice answer grid shared by the audio Players: a responsive grid
 * of big tappable cards. Picking a card does not reveal the answer by default;
 * callers opt into the reveal-and-lock state after their own correctness check.
 * Optional per-choice `labels` render a romanization under the glyph and fold
 * into the aria-label.
 */
export function ChoiceGrid({
  choices,
  answerIndex,
  picked,
  onChoose,
  labels,
  revealAnswer = false,
  disabled = false,
}: {
  choices: string[];
  answerIndex: number;
  picked: number | null;
  onChoose: (choiceIndex: number) => void;
  labels?: (string | undefined)[];
  /** Reveals the correct card and locks the grid. Defaults to false. */
  revealAnswer?: boolean;
  /** Locks the grid while required media is unavailable or a round is complete. */
  disabled?: boolean;
}) {
  const locked = disabled || revealAnswer;
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
            disabled={locked}
            aria-pressed={isPicked}
            aria-label={label ? `${choice}, ${label}` : choice}
            className={cn(
              "relative grid min-h-28 place-items-center gap-1 rounded-2xl border-[3px] border-ink px-4 py-5 text-ink shadow-pop transition duration-200 ease-out",
              !revealAnswer && "bg-paper-raised hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              !revealAnswer && isPicked && "bg-honey/25 ring-4 ring-honey/60",
              revealAnswer && isAnswer && "bg-success/30",
              revealAnswer && !isAnswer && "bg-paper-raised opacity-60",
              revealAnswer && isPicked && !isAnswer && "opacity-100",
            )}
          >
            <span className="font-display text-4xl">{choice}</span>
            {label ? <span className="text-sm text-ink-soft">{label}</span> : null}
            {revealAnswer && isAnswer && (
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
