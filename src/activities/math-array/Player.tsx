"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathArrayConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { captureNonCritical } from "@/lib/capture";
import { Button } from "@/components/ui/Button";
import { Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeech } from "../_shared/useSpeech";
import {
  expectedFor,
  schema,
  score,
  totalFor,
  type MathArrayResponse,
} from "./logic";

export function MathArrayPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathArrayConfig, MathArrayResponse>) {
  const parsed = useMemo(() => schema.parse(config), [config]);
  const speech = useSpeech();
  const reduced = useReducedMotion();

  // Audio is an enhancement, never required: the prompt text is always on screen
  // (see <Prompt>), so a TTS engine that throws (some browsers throw synchronously
  // from speechSynthesis) must never break the activity. Swallow + report; the
  // child still sees every instruction and the wrong-answer hints.
  const safeSpeak = useCallback(
    (text: string) => {
      try {
        speech.speak(text);
      } catch (error) {
        captureNonCritical("math-array: speech.speak failed", error);
      }
    },
    [speech],
  );

  const total = totalFor(parsed);
  const expected = expectedFor(parsed);
  const isBuild = parsed.mode === "build";

  // How many tiles the child has tapped on (row-major). In non-build modes the
  // array is shown fully built so the child can see/count the structure.
  const [filled, setFilled] = useState(isBuild ? 0 : total);
  const [answer, setAnswer] = useState(0); // the product / quotient being entered
  const [attempts, setAttempts] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState<MathArrayResponse | null>(null);

  const spokenRef = useRef(false);
  useEffect(() => {
    if (spokenRef.current) return;
    spokenRef.current = true;
    safeSpeak(parsed.instruction);
  }, [parsed.instruction, safeSpeak]);

  // Clear the wrong-state timer on unmount so a mid-shake navigation can't set
  // state after the component is gone.
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message={isBuild ? "You built the whole array." : "You found the number."}
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  function tapTile(index: number) {
    if (!isBuild || wrong) return;
    // Tapping a tile fills up to it (or clears back to it if already filled).
    setFilled((prev) => (index < prev ? index : index + 1));
  }

  function bump(delta: number) {
    if (wrong) return;
    setAnswer((prev) => Math.max(0, Math.min(prev + delta, 200)));
  }

  function resetBuild() {
    setFilled(0);
  }

  function finishBuild() {
    // Building the array is the answer; it always "reaches" (no wrong state).
    setDone({ entered: total, attempts: 1 });
  }

  function check() {
    const attemptCount = attempts + 1;
    setAttempts(attemptCount);
    if (answer === expected) {
      setDone({ entered: answer, attempts: attemptCount });
    } else {
      setWrong(true);
      safeSpeak(
        answer > expected ? "That's a little too many. Count again." : "A little more. Count again.",
      );
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setWrong(false), 900);
    }
  }

  const buildComplete = filled === total;
  const equation = equationText(parsed);

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {equation && (
        <p className="text-center font-display text-2xl text-ink" aria-hidden="true">
          {equation}
        </p>
      )}

      <motion.div
        className="flex justify-center"
        animate={wrong && !reduced ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
      >
        <ArrayGrid
          rows={parsed.rows}
          cols={parsed.cols}
          filled={filled}
          emoji={parsed.emoji}
          interactive={isBuild && !wrong}
          mode={parsed.mode}
          reduced={reduced}
          onTapTile={tapTile}
        />
      </motion.div>

      <p className="text-center text-sm text-ink-soft" aria-live="polite">
        {isBuild
          ? buildComplete
            ? `${parsed.rows} rows of ${parsed.cols}`
            : `${filled} of ${total} tiles`
          : countingHint(parsed)}
      </p>

      {isBuild ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="soft" size="md" onClick={resetBuild} disabled={filled === 0}>
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Clear
          </Button>
          <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
          <Button variant="primary" size="kid" onClick={finishBuild} disabled={!buildComplete}>
            I built it
          </Button>
        </div>
      ) : (
        <div className="grid justify-items-center gap-5">
          <AnswerStepper value={answer} disabled={wrong} onBump={bump} />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
            <Button variant="primary" size="kid" onClick={check} disabled={wrong}>
              Check it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The rows x cols array of tiles. Filled tiles carry the accent (or the emoji);
 *  in build mode unfilled tiles are tappable dashed wells. */
function ArrayGrid({
  rows,
  cols,
  filled,
  emoji,
  interactive,
  mode,
  reduced,
  onTapTile,
}: {
  rows: number;
  cols: number;
  filled: number;
  emoji?: string;
  interactive: boolean;
  mode: MathArrayConfig["mode"];
  reduced: boolean;
  onTapTile: (index: number) => void;
}) {
  // Divide shows the whole total grouped by row, so each row reads as one share.
  const groupByRow = mode === "divide";
  return (
    <div
      role="grid"
      aria-label={`Array with ${rows} rows and ${cols} columns`}
      className={cn(
        "inline-grid gap-1.5 rounded-2xl border-[3px] border-ink bg-paper-raised p-3 shadow-pop",
        groupByRow && "gap-y-3",
      )}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: rows * cols }, (_, index) => {
        const isFilled = index < filled;
        const tileClass = cn(
          "grid size-12 place-items-center rounded-xl border-2 text-2xl transition duration-200 ease-out sm:size-14",
          isFilled ? "border-ink bg-accent" : "border-dashed border-ink/25 bg-paper-sunk",
          interactive && "hover:border-ink/50 active:translate-y-px",
        );
        const fill = isFilled ? <TileFill emoji={emoji} reduced={reduced} /> : null;
        return interactive ? (
          <button
            key={index}
            type="button"
            onClick={() => onTapTile(index)}
            aria-label={isFilled ? `Tile ${index + 1}, filled` : `Empty tile ${index + 1}`}
            aria-pressed={isFilled}
            className={tileClass}
          >
            {fill}
          </button>
        ) : (
          <div key={index} aria-hidden="true" className={tileClass}>
            {fill}
          </div>
        );
      })}
    </div>
  );
}

/** What sits inside a filled tile: the configured emoji, or an accent dot that
 *  pops in (instant under reduced-motion). */
function TileFill({ emoji, reduced }: { emoji?: string; reduced: boolean }) {
  if (emoji) {
    return (
      <span role="img" aria-hidden="true">
        {emoji}
      </span>
    );
  }
  return (
    <motion.span
      className="size-7 rounded-full bg-accent-deep sm:size-8"
      initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

/** A big, forgiving +/- stepper for entering the product or quotient. */
function AnswerStepper({
  value,
  disabled,
  onBump,
}: {
  value: number;
  disabled: boolean;
  onBump: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <StepButton label="One less" disabled={disabled || value === 0} onClick={() => onBump(-1)}>
        <MinusIcon size={28} weight="bold" aria-hidden="true" />
      </StepButton>
      <span
        className="grid h-20 min-w-24 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised px-6 font-display text-5xl text-ink shadow-pop"
        aria-live="polite"
        aria-label={`Your answer: ${value}`}
      >
        {value}
      </span>
      <StepButton label="One more" disabled={disabled} onClick={() => onBump(1)}>
        <PlusIcon size={28} weight="bold" aria-hidden="true" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-16 place-items-center rounded-2xl border-[3px] border-ink bg-honey text-ink shadow-pop",
        "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}

/** The equation hint shown above the array, by mode. */
function equationText(config: MathArrayConfig): string | null {
  switch (config.mode) {
    case "multiply":
      return `${config.rows} × ${config.cols} = ?`;
    case "area":
      return `${config.rows} × ${config.cols} = ? squares`;
    case "divide":
      return `${totalFor(config)} ÷ ${config.rows} = ?`;
    case "build":
      return null;
  }
}

/** A spoken-tone hint under the grid for the non-build modes. */
function countingHint(config: MathArrayConfig): string {
  switch (config.mode) {
    case "divide":
      return `Share ${totalFor(config)} into ${config.rows} equal rows. How many in each?`;
    case "area":
      return "How many squares cover the shape?";
    default:
      return `${config.rows} rows of ${config.cols}. How many in all?`;
  }
}
