"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathFractionBarConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { equalSegments, toggleSelectedSegment } from "./model";
import {
  isCorrect,
  schema,
  type MathFractionBarResponse,
} from "./logic";

const BAR_GRID_CLASS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function MathFractionBarPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathFractionBarConfig, MathFractionBarResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();
  const [partitionCount, setPartitionCount] = useState<number | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);

  useSpeakOnce(speech.speak, parsed.instruction);

  const hasWork = parsed.mode === "partition" ? partitionCount !== null : selectedSegments.length > 0;

  function choosePartition(count: number) {
    if (shake.wrong) return;
    setPartitionCount(count);
    speech.speak(`${count} equal parts.`);
  }

  function toggleSegment(index: number) {
    if (shake.wrong) return;
    const next = toggleSelectedSegment(selectedSegments, index, parsed.denominator);
    if (next === selectedSegments) return;
    const mutableNext = [...next];
    setSelectedSegments(mutableNext);
    speech.speak(`${mutableNext.length} of ${parsed.denominator} equal parts selected.`);
  }

  function reset() {
    if (shake.wrong || !hasWork) return;
    setPartitionCount(null);
    setSelectedSegments([]);
    speech.speak(parsed.mode === "partition" ? "One whole bar." : "Selection cleared.");
  }

  function check() {
    if (!hasWork) return;
    const attemptCount = Math.min(attempts + 1, 20);
    setAttempts(attemptCount);
    const response: MathFractionBarResponse =
      parsed.mode === "partition"
        ? { mode: "partition", partitionCount: partitionCount ?? 2, attempts: attemptCount }
        : { mode: "identify", selectedSegments, attempts: attemptCount };

    if (isCorrect(parsed, response)) {
      onComplete(response);
      return;
    }

    shake.trigger({
      speak: () =>
        speech.speak(
          parsed.mode === "partition"
            ? "Keep the bar. Try a different number of equal parts."
            : `Keep the bar. Show ${parsed.numerator} of ${parsed.denominator} equal parts.`,
        ),
    });
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <p className="text-center font-display text-3xl text-ink" aria-label={`Target fraction ${parsed.numerator} over ${parsed.denominator}`}>
        {parsed.numerator}/{parsed.denominator}
      </p>

      <motion.div className="grid justify-items-center gap-5" {...shake.shakeProps(reduced)}>
        {parsed.mode === "partition" ? (
          <PartitionSurface partitionCount={partitionCount} reduced={reduced} />
        ) : (
          <IdentifySurface
            denominator={parsed.denominator}
            selectedSegments={selectedSegments}
            reduced={reduced}
            disabled={shake.wrong}
            onToggle={toggleSegment}
          />
        )}

        <ProgressHint>
          {parsed.mode === "partition"
            ? partitionCount === null
              ? "Start with one whole bar."
              : `${partitionCount} equal parts shown.`
            : `${selectedSegments.length} of ${parsed.denominator} equal parts selected.`}
        </ProgressHint>
      </motion.div>

      {parsed.mode === "partition" && (
        <div role="group" aria-label="Choose the number of equal parts" className="flex flex-wrap justify-center gap-3">
          {[2, 3, 4].map((count) => (
            <Button
              key={count}
              variant={partitionCount === count ? "honey" : "soft"}
              size="md"
              aria-pressed={partitionCount === count}
              disabled={shake.wrong}
              onClick={() => choosePartition(count)}
            >
              Split into {count} equal parts
            </Button>
          ))}
        </div>
      )}

      <PlayerControls>
        <Button variant="soft" size="md" onClick={reset} disabled={!hasWork || shake.wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Start over
        </Button>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        <Button variant="primary" size="kid" onClick={check} disabled={!hasWork || shake.wrong}>
          Check it
        </Button>
      </PlayerControls>
    </div>
  );
}

function PartitionSurface({
  partitionCount,
  reduced,
}: {
  partitionCount: number | null;
  reduced: boolean;
}) {
  if (partitionCount === null) {
    return (
      <div
        role="img"
        aria-label="One whole bar with no partitions"
        className="h-40 w-full max-w-3xl rounded-2xl border-[4px] border-ink bg-honey shadow-pop"
      />
    );
  }

  return (
    <div
      role="group"
      aria-label={`Bar split into ${partitionCount} equal parts`}
      className={cn(
        "grid h-40 w-full max-w-3xl overflow-hidden rounded-2xl border-[4px] border-ink bg-paper-raised shadow-pop",
        BAR_GRID_CLASS[partitionCount],
      )}
    >
      {equalSegments(partitionCount).map((segment) => (
        <motion.div
          key={segment.index}
          role="img"
          aria-label={`Equal part ${segment.index + 1} of ${partitionCount}`}
          className={cn(
            "grid place-items-center border-ink text-xl font-bold text-ink",
            segment.index > 0 && "border-l-[3px]",
            segment.index % 2 === 0 ? "bg-honey" : "bg-accent/45",
          )}
          initial={reduced ? false : { opacity: 0, scaleX: 0.75 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          {segment.index + 1}
        </motion.div>
      ))}
    </div>
  );
}

function IdentifySurface({
  denominator,
  selectedSegments,
  reduced,
  disabled,
  onToggle,
}: {
  denominator: number;
  selectedSegments: readonly number[];
  reduced: boolean;
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Bar with ${denominator} equal parts`}
      className={cn(
        "grid h-40 w-full max-w-3xl overflow-hidden rounded-2xl border-[4px] border-ink bg-paper-raised shadow-pop",
        BAR_GRID_CLASS[denominator],
      )}
    >
      {equalSegments(denominator).map((segment) => {
        const selected = selectedSegments.includes(segment.index);
        return (
          <button
            key={segment.index}
            type="button"
            aria-label={`Part ${segment.index + 1} of ${denominator}, ${selected ? "selected" : "not selected"}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onToggle(segment.index)}
            className={cn(
              "relative grid place-items-center border-ink text-xl font-bold text-ink transition",
              segment.index > 0 && "border-l-[3px]",
              selected ? "bg-accent" : "bg-paper-raised hover:bg-honey/35",
            )}
          >
            <motion.span
              initial={false}
              animate={{ scale: selected && !reduced ? 1.12 : 1 }}
              transition={{ duration: reduced ? 0.001 : 0.18 }}
            >
              {segment.index + 1}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
