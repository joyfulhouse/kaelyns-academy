"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathTenframeConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { goalFor, schema, score, type MathTenframeResponse } from "./logic";

const CELLS_PER_FRAME = 10;

export function MathTenframePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathTenframeConfig, MathTenframeResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const goal = goalFor(parsed);
  const capacity = parsed.frames * CELLS_PER_FRAME;
  // In "add" mode the first `target` dots are given (the starting set); the
  // child adds `addend` more. In "represent" mode nothing is preset.
  const preset = parsed.mode === "add" ? Math.min(parsed.target, capacity) : 0;

  const [added, setAdded] = useState(0); // dots the child placed
  const [attempts, setAttempts] = useState(0);
  const [done, setDone] = useState<MathTenframeResponse | null>(null);

  const total = preset + added;

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message={parsed.mode === "add" ? "You made the number." : "You filled it just right."}
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  function toggleCell(index: number) {
    if (shake.wrong) return;
    if (index < preset) return; // preset dots are locked (the given quantity)
    const placedIndex = index - preset;
    if (placedIndex < added) {
      setAdded(placedIndex); // tapping a placed dot removes it and everything after
    } else {
      const next = Math.min(added + 1, capacity - preset);
      setAdded(next);
      speech.speak(String(preset + next));
    }
  }

  function reset() {
    setAdded(0);
  }

  function check() {
    const attemptCount = attempts + 1;
    setAttempts(attemptCount);
    if (total === goal) {
      setDone({ count: total, attempts: attemptCount });
    } else {
      shake.trigger({
        speak: () =>
          speech.speak(
            total > goal ? "That's a little too many. Try again." : "A few more. Try again.",
          ),
      });
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {parsed.mode === "add" && (
        <p className="text-center font-display text-2xl text-ink" aria-hidden="true">
          {parsed.target} + {parsed.addend ?? 0} = ?
        </p>
      )}

      <motion.div
        className="flex flex-wrap items-center justify-center gap-6"
        {...shake.shakeProps(reduced)}
      >
        {Array.from({ length: parsed.frames }, (_, frame) => (
          <TenFrame
            key={frame}
            frame={frame}
            preset={preset}
            placed={added}
            reduced={reduced}
            onToggle={toggleCell}
          />
        ))}
      </motion.div>

      <ProgressHint>
        {total === 0 ? "Tap to add dots" : `${total} dot${total === 1 ? "" : "s"}`}
      </ProgressHint>

      <PlayerControls>
        <Button variant="soft" size="md" onClick={reset} disabled={added === 0 || shake.wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Clear
        </Button>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        <Button variant="primary" size="kid" onClick={check} disabled={shake.wrong}>
          Check it
        </Button>
      </PlayerControls>
    </div>
  );
}

/** One ten-frame: a 2×5 grid of tappable cells. Preset dots (the given amount)
 *  render in honey + locked; the child's placed dots render in the accent. */
function TenFrame({
  frame,
  preset,
  placed,
  reduced,
  onToggle,
}: {
  frame: number;
  preset: number;
  placed: number;
  reduced: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 rounded-2xl border-[3px] border-ink bg-paper-raised p-3 shadow-pop">
      {Array.from({ length: CELLS_PER_FRAME }, (_, i) => {
        const index = frame * CELLS_PER_FRAME + i;
        const isPreset = index < preset;
        const isPlaced = !isPreset && index < preset + placed;
        const filled = isPreset || isPlaced;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(index)}
            disabled={isPreset}
            aria-label={filled ? `Dot ${index + 1}, filled` : `Empty space ${index + 1}`}
            aria-pressed={filled}
            className={cn(
              "grid size-11 place-items-center rounded-full border-2 transition duration-200 ease-out sm:size-16",
              isPreset
                ? "border-ink bg-honey"
                : isPlaced
                  ? "border-ink bg-accent"
                  : "border-dashed border-ink/25 bg-paper-sunk hover:border-ink/50",
            )}
          >
            {filled && (
              <motion.span
                className={cn("size-9 rounded-full", isPreset ? "bg-honey-deep" : "bg-accent-deep")}
                initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
