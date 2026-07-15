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
import {
  equalSegments,
  partitionCandidates,
  partitionDescription,
  toggleSelectedSegment,
  type PartitionCandidate,
  type PartitionCandidateId,
} from "./model";
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
  const [partitionId, setPartitionId] = useState<PartitionCandidateId | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  useSpeakOnce(speech.speak, parsed.instruction);

  const hasWork = parsed.mode === "partition" ? partitionId !== null : selectedSegments.length > 0;

  function choosePartition(id: PartitionCandidateId, choiceNumber: number) {
    if (shake.wrong) return;
    setPartitionId(id);
    setFeedback(null);
    speech.speak(`Partition choice ${choiceNumber} selected. Compare every share before checking.`);
  }

  function toggleSegment(index: number) {
    if (shake.wrong) return;
    const next = toggleSelectedSegment(selectedSegments, index, parsed.denominator);
    if (next === selectedSegments) return;
    const mutableNext = [...next];
    setSelectedSegments(mutableNext);
    setFeedback(null);
    speech.speak(`${mutableNext.length} of ${parsed.denominator} equal parts selected.`);
  }

  function reset() {
    if (shake.wrong || !hasWork) return;
    setPartitionId(null);
    setSelectedSegments([]);
    setFeedback(null);
    speech.speak(parsed.mode === "partition" ? "Partition choice cleared." : "Selection cleared.");
  }

  function check() {
    if (!hasWork) return;
    const attemptCount = Math.min(attempts + 1, 20);
    setAttempts(attemptCount);
    const response: MathFractionBarResponse =
      parsed.mode === "partition"
        ? { mode: "partition", partitionId: partitionId ?? "narrow-first", attempts: attemptCount }
        : { mode: "identify", selectedSegments, attempts: attemptCount };

    if (isCorrect(parsed, response)) {
      onComplete(response);
      return;
    }

    const message =
      parsed.mode === "partition"
        ? "Keep your choice. Compare the width of every share. Fair shares should match."
        : "Keep your selection. Count the shaded pieces and inspect whether every share is the same size.";
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak(message) });
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {parsed.mode === "identify" ? (
        <p className="text-center font-display text-3xl text-ink" aria-label={`Target fraction ${parsed.numerator} over ${parsed.denominator}`}>
          {parsed.numerator}/{parsed.denominator}
        </p>
      ) : (
        <p className="text-center font-display text-2xl text-ink">
          Which partition gives every person a fair share?
        </p>
      )}

      <motion.div className="grid justify-items-center gap-5" {...shake.shakeProps(reduced)}>
        {parsed.mode === "partition" ? (
          <PartitionSurface
            denominator={parsed.denominator}
            selectedId={partitionId}
            reduced={reduced}
            disabled={shake.wrong}
            onChoose={choosePartition}
          />
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
          <span className="block">
            {parsed.mode === "partition"
              ? partitionId === null
                ? "Look across every bar. The fair shares have matching widths."
                : "One partition selected. Compare all of its shares, then check."
              : `${selectedSegments.length} of ${parsed.denominator} equal parts selected.`}
          </span>
          {feedback ? <span className="mt-2 block font-semibold text-ink">{feedback}</span> : null}
        </ProgressHint>
      </motion.div>

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
  denominator,
  selectedId,
  reduced,
  disabled,
  onChoose,
}: {
  denominator: number;
  selectedId: PartitionCandidateId | null;
  reduced: boolean;
  disabled: boolean;
  onChoose: (id: PartitionCandidateId, choiceNumber: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Choose the fair ${denominator}-part partition`}
      className="grid w-full max-w-4xl gap-4 sm:grid-cols-3"
    >
      {partitionCandidates(denominator).map((candidate, index) => (
        <motion.button
          key={candidate.id}
          type="button"
          aria-label={partitionDescription(candidate, index + 1)}
          aria-pressed={selectedId === candidate.id}
          disabled={disabled}
          onClick={() => onChoose(candidate.id, index + 1)}
          className={cn(
            "grid min-h-44 gap-3 rounded-3xl border-[3px] border-ink bg-paper-raised p-4 text-ink shadow-pop transition",
            "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50",
            selectedId === candidate.id && "bg-honey ring-4 ring-accent-deep ring-offset-2",
          )}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          <PartitionCandidateGraphic candidate={candidate} choiceNumber={index + 1} />
          <span className="font-display text-lg">Choice {index + 1}</span>
        </motion.button>
      ))}
    </div>
  );
}

function PartitionCandidateGraphic({
  candidate,
  choiceNumber,
}: {
  candidate: PartitionCandidate;
  choiceNumber: number;
}) {
  const total = candidate.partWidths.reduce((sum, width) => sum + width, 0);

  return (
    <svg
      viewBox="0 0 320 104"
      aria-hidden="true"
      focusable="false"
      data-testid={`partition-choice-${choiceNumber}`}
      data-part-widths={candidate.partWidths.join(",")}
      className="h-auto w-full"
    >
      {candidate.partWidths.map((width, index) => {
        const used = candidate.partWidths
          .slice(0, index)
          .reduce((sum, priorWidth) => sum + priorWidth, 0);
        const x = (used / total) * 300 + 10;
        const renderedWidth = (width / total) * 300;
        return (
          <rect
            key={`${width}-${index}`}
            x={x}
            y="18"
            width={renderedWidth}
            height="68"
            fill={index % 2 === 0 ? "var(--color-honey)" : "var(--color-accent)"}
            stroke="var(--color-ink)"
            strokeWidth="4"
          />
        );
      })}
    </svg>
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
