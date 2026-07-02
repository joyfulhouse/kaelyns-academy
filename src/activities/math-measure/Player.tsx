"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { schema, score, type MathMeasureResponse } from "./logic";

type CompareConfig = Extract<MathMeasureConfig, { mode: "compare" }>;
type UnitsConfig = Extract<MathMeasureConfig, { mode: "units" }>;

/** Tile height by rank (0 = smallest item … 3 = largest), a static class array —
 *  never an inline style or a constructed class (DESIGN.md / CLAUDE.md). */
const RANK_HEIGHT = ["h-12", "h-16", "h-20", "h-24"] as const;

/** attribute + question → the comparison word the prompt asks about. */
const COMPARE_WORD: Record<CompareConfig["attribute"], Record<CompareConfig["question"], string>> = {
  length: { most: "longest", least: "shortest" },
  height: { most: "tallest", least: "shortest" },
  weight: { most: "heaviest", least: "lightest" },
};

/** Per-unit ruler glyph: a static map (JIT-safe, no dynamic class construction). */
const UNIT_META: Record<UnitsConfig["unit"], { emoji: string; label: string }> = {
  cube: { emoji: "🧊", label: "cube" },
  paperclip: { emoji: "📎", label: "paperclip" },
  block: { emoji: "🧱", label: "block" },
  hand: { emoji: "✋", label: "hand" },
};

/** Rank each item by `size`, ascending (0 = smallest). Ties keep array order. */
function ranksBySize(items: { size: number }[]): number[] {
  const order = items.map((item, i) => ({ i, size: item.size })).sort((a, b) => a.size - b.size);
  const ranks = new Array<number>(items.length);
  order.forEach((entry, rank) => {
    ranks[entry.i] = rank;
  });
  return ranks;
}

export function MathMeasurePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathMeasureConfig, MathMeasureResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [attempts, setAttempts] = useState(0);
  const [done, setDone] = useState<MathMeasureResponse | null>(null);

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  const ranks = useMemo(
    () => (parsed.mode === "compare" ? ranksBySize(parsed.items) : []),
    [parsed],
  );

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message={parsed.mode === "compare" ? "You found the right one." : "You measured it right."}
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  function tapChoice(index: number) {
    if (shake.wrong) return;
    const attemptCount = attempts + 1;
    if (index === parsed.answerIndex) {
      setDone({ attempts: attemptCount, selectedIndex: index });
    } else {
      setAttempts(attemptCount);
      shake.trigger({ speak: () => speech.speak("Try another one.") });
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {parsed.mode === "compare" ? (
        <CompareBoard
          config={parsed}
          ranks={ranks}
          onTap={tapChoice}
          disabled={shake.wrong}
          reduced={reduced}
          shake={shake}
        />
      ) : (
        <UnitsBoard config={parsed} onTap={tapChoice} disabled={shake.wrong} reduced={reduced} shake={shake} />
      )}

      <PlayerControls>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
      </PlayerControls>
    </div>
  );
}

function CompareBoard({
  config,
  ranks,
  onTap,
  disabled,
  reduced,
  shake,
}: {
  config: CompareConfig;
  ranks: number[];
  onTap: (index: number) => void;
  disabled: boolean;
  reduced: boolean;
  shake: ReturnType<typeof useWrongShake>;
}) {
  const word = COMPARE_WORD[config.attribute][config.question];
  return (
    <>
      <p className="text-center font-display text-xl text-ink">
        Which one is the <span className="text-accent-deep">{word}</span>?
      </p>
      <motion.div
        role="group"
        aria-label={`Choose the ${word} item`}
        className="mx-auto grid max-w-2xl grid-cols-2 items-end gap-4 sm:grid-cols-4"
        {...shake.shakeProps(reduced)}
      >
        {config.items.map((item, i) => (
          <button
            key={`${item.label}-${i}`}
            type="button"
            onClick={() => onTap(i)}
            disabled={disabled}
            aria-label={item.label}
            className={cn(
              "grid min-h-11 place-items-center gap-2 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-4 shadow-pop transition duration-200 ease-out",
              "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <div className={cn("flex w-16 items-end justify-center", RANK_HEIGHT[ranks[i]])}>
              <span className="text-4xl leading-none" role="img" aria-hidden="true">
                {item.emoji}
              </span>
            </div>
            <span className="font-display text-lg text-ink">{item.label}</span>
          </button>
        ))}
      </motion.div>
    </>
  );
}

function UnitsBoard({
  config,
  onTap,
  disabled,
  reduced,
  shake,
}: {
  config: UnitsConfig;
  onTap: (index: number) => void;
  disabled: boolean;
  reduced: boolean;
  shake: ReturnType<typeof useWrongShake>;
}) {
  const meta = UNIT_META[config.unit];
  const units = Array.from({ length: config.length }, (_, i) => i);
  return (
    <>
      <motion.div
        role="img"
        aria-label={`A row of ${config.length} ${meta.label}${config.length === 1 ? "" : "s"}`}
        className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-1 rounded-2xl border-[3px] border-dashed border-ink/25 bg-paper-sunk p-4"
        {...shake.shakeProps(reduced)}
      >
        {units.map((i) => (
          <span key={i} className="text-3xl leading-none" aria-hidden="true">
            {meta.emoji}
          </span>
        ))}
      </motion.div>

      <div
        role="group"
        aria-label={`How many ${meta.label}s long is it?`}
        className="mx-auto grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-3"
      >
        {config.choices.map((choice, i) => (
          <button
            key={`${choice}-${i}`}
            type="button"
            onClick={() => onTap(i)}
            disabled={disabled}
            aria-label={`${choice} ${meta.label}s`}
            className={cn(
              "min-h-11 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-4 font-display text-2xl text-ink shadow-pop transition duration-200 ease-out",
              "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {choice}
          </button>
        ))}
      </div>

      <ProgressHint>{`How many ${meta.label}s long?`}</ProgressHint>
    </>
  );
}
