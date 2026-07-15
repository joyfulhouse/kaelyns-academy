"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import {
  addPlacedUnit,
  balanceAngle,
  balanceTiltDirection,
  deriveComparisonIndex,
  MEASUREMENT_UNIT_PX,
  measurementExtent,
  placedUnitCount,
  removePlacedUnit,
  rotatePoint,
  scaledExtent,
} from "./measure-model";
import { schema, type MathMeasureResponse } from "./logic";

type CompareConfig = Extract<MathMeasureConfig, { mode: "compare" }>;
type UnitsConfig = Extract<MathMeasureConfig, { mode: "units" }>;

const COMPARE_WORD: Record<CompareConfig["attribute"], Record<CompareConfig["question"], string>> = {
  length: { most: "longest", least: "shortest" },
  height: { most: "tallest", least: "shortest" },
  weight: { most: "heaviest", least: "lightest" },
};

const UNIT_META: Record<
  UnitsConfig["unit"],
  { singular: string; plural: string; short: string; fill: string }
> = {
  cube: { singular: "cube", plural: "cubes", short: "C", fill: "var(--color-accent)" },
  paperclip: {
    singular: "paperclip",
    plural: "paperclips",
    short: "clip",
    fill: "var(--color-paper-sunk)",
  },
  block: { singular: "block", plural: "blocks", short: "B", fill: "var(--color-honey)" },
  hand: { singular: "hand", plural: "hands", short: "hand", fill: "var(--color-success)" },
};

const MEASUREMENT_START_X = 28;
const MEASUREMENT_WORKSPACE_WIDTH = MEASUREMENT_START_X * 2 + measurementExtent(12);
const MEASUREMENT_WORKSPACE_HEIGHT = 184;
const MEASUREMENT_UNIT_Y = 116;

export function MathMeasurePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathMeasureConfig, MathMeasureResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [attempts, setAttempts] = useState(0);
  const [placedUnitIds, setPlacedUnitIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const nextUnit = useRef(1);

  useSpeakOnce(speech.speak, parsed.instruction);

  function tapChoice(index: number) {
    if (parsed.mode !== "compare" || shake.wrong) return;
    const attemptCount = Math.min(attempts + 1, 20);
    const answer = deriveComparisonIndex(parsed.attribute, parsed.question, parsed.items);
    if (answer !== null && index === answer) {
      const response: MathMeasureResponse = { attempts: attemptCount, selectedIndex: index };
      onComplete(response);
      return;
    }
    const message =
      parsed.attribute === "weight"
        ? "Look at which pan sits lower, then try again."
        : "Start each object at the same line, then compare where it ends.";
    setAttempts(attemptCount);
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak(message) });
  }

  function addUnit() {
    if (parsed.mode !== "units" || shake.wrong || placedUnitIds.length >= 12) return;
    const unitId = `unit-${nextUnit.current}`;
    nextUnit.current += 1;
    const nextIds = addPlacedUnit(placedUnitIds, unitId, 12);
    setPlacedUnitIds(nextIds);
    setFeedback(null);
    setAnnouncement(`${placedUnitCount(nextIds)} ${UNIT_META[parsed.unit].plural} placed.`);
  }

  function removeUnit(unitId: string) {
    if (parsed.mode !== "units" || shake.wrong) return;
    const nextIds = removePlacedUnit(placedUnitIds, unitId);
    setPlacedUnitIds(nextIds);
    setFeedback(null);
    setAnnouncement(`${placedUnitCount(nextIds)} ${UNIT_META[parsed.unit].plural} placed.`);
  }

  function clearUnits() {
    setPlacedUnitIds([]);
    setFeedback(null);
    setAnnouncement("Measurement line cleared.");
  }

  function checkUnits() {
    if (parsed.mode !== "units" || shake.wrong) return;
    const attemptCount = Math.min(attempts + 1, 20);
    const count = placedUnitCount(placedUnitIds);
    setAttempts(attemptCount);
    if (count === parsed.length) {
      const response: MathMeasureResponse = {
        attempts: attemptCount,
        placedUnitIds: [...placedUnitIds],
      };
      onComplete(response);
      return;
    }
    const message =
      count < parsed.length
        ? "Keep your units in place and measure a little farther."
        : "Your units reach past the object. Remove one and check again.";
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak(message) });
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {parsed.mode === "compare" ? (
        <CompareBoard
          config={parsed}
          onChoose={tapChoice}
          disabled={shake.wrong}
          reduced={reduced}
          shake={shake}
        />
      ) : (
        <UnitsBoard
          config={parsed}
          unitIds={placedUnitIds}
          onAdd={addUnit}
          onRemove={removeUnit}
          disabled={shake.wrong}
          reduced={reduced}
          shake={shake}
        />
      )}

      {parsed.mode === "compare" ? (
        feedback ? <ProgressHint className="font-semibold text-ink">{feedback}</ProgressHint> : null
      ) : (
        <ProgressHint>
          <span className="block font-display text-lg text-ink">
            {placedUnitCount(placedUnitIds)} {UNIT_META[parsed.unit].plural} placed
          </span>
          <span className="block">Place equal units end to end from the start line.</span>
          {feedback ? <span className="mt-2 block font-semibold text-ink">{feedback}</span> : null}
        </ProgressHint>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <PlayerControls>
        {parsed.mode === "units" ? (
          <Button
            variant="soft"
            size="md"
            onClick={clearUnits}
            disabled={placedUnitIds.length === 0 || shake.wrong}
          >
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {parsed.mode === "units" ? (
          <Button variant="primary" size="kid" onClick={checkUnits} disabled={shake.wrong}>
            Check it
          </Button>
        ) : null}
      </PlayerControls>
    </div>
  );
}

function CompareBoard({
  config,
  onChoose,
  disabled,
  reduced,
  shake,
}: {
  config: CompareConfig;
  onChoose: (index: number) => void;
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
      <motion.div className="grid gap-5" {...shake.shakeProps(reduced)}>
        {config.attribute === "weight" ? (
          <WeightBalance config={config} />
        ) : (
          <ProportionalComparison config={config} />
        )}

        <div
          role="group"
          aria-label={`Choose the ${word} item`}
          className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {config.items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              onClick={() => onChoose(index)}
              disabled={disabled}
              aria-label={`Choose ${item.label}`}
              className="grid min-h-24 place-items-center gap-2 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-4 shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="text-4xl leading-none" role="img" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="font-display text-lg text-ink">{item.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

function ProportionalComparison({ config }: { config: CompareConfig }) {
  const largest = Math.max(...config.items.map((item) => item.size));
  if (config.attribute === "height") {
    const baselineY = 188;
    return (
      <svg
        viewBox="0 0 600 220"
        role="img"
        aria-label="Height comparison with every object standing on the same baseline"
        className="mx-auto h-auto w-full max-w-3xl"
      >
        <line x1="40" y1={baselineY} x2="560" y2={baselineY} stroke="var(--color-ink)" strokeWidth="4" />
        {config.items.map((item, index) => {
          const x = ((index + 1) * 560) / (config.items.length + 1);
          const height = scaledExtent(item.size, largest, 135);
          return (
            <g key={`${item.label}-${index}`} aria-hidden="true">
              <rect
                x={x - 30}
                y={baselineY - height}
                width="60"
                height={height}
                rx="14"
                fill="var(--color-accent)"
                stroke="var(--color-ink)"
                strokeWidth="3"
              />
              <text x={x} y="211" textAnchor="middle" fill="var(--color-ink)" fontSize="15" fontWeight="700">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const rowHeight = 46;
  const viewHeight = config.items.length * rowHeight + 24;
  return (
    <svg
      viewBox={`0 0 600 ${viewHeight}`}
      role="img"
      aria-label="Length comparison with every object starting at the same line"
      className="mx-auto h-auto w-full max-w-3xl"
    >
      <line x1="120" y1="8" x2="120" y2={viewHeight - 8} stroke="var(--color-ink)" strokeWidth="4" />
      {config.items.map((item, index) => {
        const y = 16 + index * rowHeight;
        const width = scaledExtent(item.size, largest, 400);
        return (
          <g key={`${item.label}-${index}`} aria-hidden="true">
            <text x="108" y={y + 16} textAnchor="end" fill="var(--color-ink)" fontSize="15" fontWeight="700">
              {item.label}
            </text>
            <rect
              x="120"
              y={y}
              width={width}
              height="24"
              rx="12"
              fill="var(--color-accent)"
              stroke="var(--color-ink)"
              strokeWidth="3"
            />
          </g>
        );
      })}
    </svg>
  );
}

function WeightBalance({ config }: { config: CompareConfig }) {
  const [left, right] = config.items;
  const angle = balanceAngle(left.size, right.size);
  const tilt = balanceTiltDirection(left.size, right.size);
  const pivot = { x: 280, y: 88 };
  const leftAttachment = rotatePoint({ x: 135, y: 88 }, pivot, angle);
  const rightAttachment = rotatePoint({ x: 425, y: 88 }, pivot, angle);
  return (
    <svg
      viewBox="0 0 560 270"
      role="img"
      aria-label={`Balance comparing ${left.label} and ${right.label}; the beam tilts toward the heavier object`}
      className="mx-auto h-auto w-full max-w-2xl"
    >
      <path d="M280 88 L225 222 H335 Z" fill="var(--color-honey)" stroke="var(--color-ink)" strokeWidth="4" />
      <line x1="190" y1="225" x2="370" y2="225" stroke="var(--color-ink)" strokeWidth="6" strokeLinecap="round" />
      <g
        data-testid="balance-beam"
        data-tilt={tilt}
        transform={`rotate(${angle} 280 88)`}
        aria-hidden="true"
      >
        <line x1="100" y1="88" x2="460" y2="88" stroke="var(--color-ink)" strokeWidth="10" strokeLinecap="round" />
      </g>
      <BalancePan side="left" attachment={leftAttachment} emoji={left.emoji} />
      <BalancePan side="right" attachment={rightAttachment} emoji={right.emoji} />
      <circle cx="280" cy="88" r="10" fill="var(--color-accent-deep)" stroke="var(--color-ink)" strokeWidth="3" />
      <text x="135" y="259" textAnchor="middle" fill="var(--color-ink)" fontSize="17" fontWeight="700">
        {left.label}
      </text>
      <text x="425" y="259" textAnchor="middle" fill="var(--color-ink)" fontSize="17" fontWeight="700">
        {right.label}
      </text>
    </svg>
  );
}

function BalancePan({
  side,
  attachment,
  emoji,
}: {
  side: "left" | "right";
  attachment: { x: number; y: number };
  emoji: string;
}) {
  return (
    <g
      data-testid={`${side}-balance-pan`}
      data-orientation="level"
      transform={`translate(${attachment.x} ${attachment.y})`}
      aria-hidden="true"
    >
      <line
        data-testid={`${side}-balance-string`}
        data-orientation="vertical"
        x1="0"
        y1="0"
        x2="0"
        y2="75"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <path
        d="M-59 75 Q0 108 59 75 Z"
        fill="var(--color-paper-sunk)"
        stroke="var(--color-ink)"
        strokeWidth="4"
      />
      <text x="0" y="66" textAnchor="middle" fontSize="42">
        {emoji}
      </text>
    </g>
  );
}

function UnitsBoard({
  config,
  unitIds,
  onAdd,
  onRemove,
  disabled,
  reduced,
  shake,
}: {
  config: UnitsConfig;
  unitIds: string[];
  onAdd: () => void;
  onRemove: (unitId: string) => void;
  disabled: boolean;
  reduced: boolean;
  shake: ReturnType<typeof useWrongShake>;
}) {
  const meta = UNIT_META[config.unit];
  const objectLabel = config.objectLabel ?? "object";
  const targetWidth = measurementExtent(config.length);
  const placedWidth = measurementExtent(unitIds.length);

  function removeWithKeyboard(event: KeyboardEvent<SVGGElement>, unitId: string) {
    if (
      event.key !== "Enter" &&
      event.key !== " " &&
      event.key !== "Delete" &&
      event.key !== "Backspace"
    ) {
      return;
    }
    event.preventDefault();
    onRemove(unitId);
  }

  return (
    <motion.div className="grid gap-5" {...shake.shakeProps(reduced)}>
      <div className="overflow-x-auto pb-2">
        <svg
          width={MEASUREMENT_WORKSPACE_WIDTH}
          height={MEASUREMENT_WORKSPACE_HEIGHT}
          viewBox={`0 0 ${MEASUREMENT_WORKSPACE_WIDTH} ${MEASUREMENT_WORKSPACE_HEIGHT}`}
          role="group"
          aria-label={`${objectLabel} and placed ${meta.plural} aligned to one measurement start line`}
          data-testid="measurement-workspace"
          data-unit-px={MEASUREMENT_UNIT_PX}
          className="mx-auto block max-w-none"
        >
          <text
            x={MEASUREMENT_START_X}
            y="16"
            fill="var(--color-accent-deep)"
            fontSize="14"
            fontWeight="700"
          >
            START
          </text>
          <line
            x1={MEASUREMENT_START_X}
            y1="22"
            x2={MEASUREMENT_START_X}
            y2="172"
            stroke="var(--color-accent-deep)"
            strokeWidth="5"
          />
          <text x={MEASUREMENT_START_X + 8} y="40" fill="var(--color-ink)" fontSize="14" fontWeight="700">
            Target object
          </text>
          <rect
            data-testid="measurement-target"
            data-unit-count={config.length}
            data-unit-px={MEASUREMENT_UNIT_PX}
            data-endpoint={targetWidth}
            x={MEASUREMENT_START_X}
            y="48"
            width={targetWidth}
            height="44"
            rx="18"
            fill="var(--color-honey)"
            stroke="var(--color-ink)"
            strokeWidth="3"
          />
          <text
            x={MEASUREMENT_START_X + targetWidth / 2}
            y="70"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-ink)"
            fontSize="17"
            fontWeight="700"
          >
            {objectLabel}
          </text>
          <text x={MEASUREMENT_START_X + 8} y="110" fill="var(--color-ink)" fontSize="14" fontWeight="700">
            Your equal units
          </text>
          <line
            x1={MEASUREMENT_START_X}
            y1={MEASUREMENT_UNIT_Y + MEASUREMENT_UNIT_PX}
            x2={MEASUREMENT_WORKSPACE_WIDTH - MEASUREMENT_START_X}
            y2={MEASUREMENT_UNIT_Y + MEASUREMENT_UNIT_PX}
            stroke="var(--color-ink)"
            strokeWidth="4"
          />
          {unitIds.length === 0 ? (
            <text
              x={MEASUREMENT_START_X + 12}
              y={MEASUREMENT_UNIT_Y + 30}
              fill="var(--color-ink-soft)"
              fontSize="14"
            >
              Place the first {meta.singular} at the start.
            </text>
          ) : (
            <g
              role="group"
              aria-label={`Placed ${meta.plural}`}
              data-testid="measurement-units"
              data-unit-count={unitIds.length}
              data-unit-px={MEASUREMENT_UNIT_PX}
              data-endpoint={placedWidth}
            >
              {unitIds.map((unitId, index) => {
                const x = MEASUREMENT_START_X + measurementExtent(index);
                return (
                  <g
                    key={unitId}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    aria-label={`Remove ${meta.singular} ${index + 1}`}
                    onClick={() => {
                      if (!disabled) onRemove(unitId);
                    }}
                    onKeyDown={(event) => {
                      if (!disabled) removeWithKeyboard(event, unitId);
                    }}
                    className="group cursor-pointer focus:outline-none"
                  >
                    <rect
                      x={x}
                      y={MEASUREMENT_UNIT_Y}
                      width={MEASUREMENT_UNIT_PX}
                      height={MEASUREMENT_UNIT_PX}
                      fill={meta.fill}
                      stroke="var(--color-ink)"
                      strokeWidth="3"
                    />
                    <rect
                      x={x + 3}
                      y={MEASUREMENT_UNIT_Y + 3}
                      width={MEASUREMENT_UNIT_PX - 6}
                      height={MEASUREMENT_UNIT_PX - 6}
                      rx="5"
                      fill="none"
                      stroke="var(--color-accent-deep)"
                      strokeWidth="4"
                      className="pointer-events-none opacity-0 group-focus-visible:opacity-100"
                    />
                    <text
                      x={x + MEASUREMENT_UNIT_PX / 2}
                      y={MEASUREMENT_UNIT_Y + MEASUREMENT_UNIT_PX / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--color-ink)"
                      fontSize="12"
                      fontWeight="700"
                      className="pointer-events-none"
                    >
                      {meta.short}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          <line
            x1={MEASUREMENT_START_X + targetWidth}
            y1="45"
            x2={MEASUREMENT_START_X + targetWidth}
            y2="96"
            stroke="var(--color-accent-deep)"
            strokeWidth="3"
            strokeDasharray="5 4"
            aria-hidden="true"
          />
          {unitIds.length > 0 ? (
            <line
              x1={MEASUREMENT_START_X + placedWidth}
              y1={MEASUREMENT_UNIT_Y - 3}
              x2={MEASUREMENT_START_X + placedWidth}
              y2={MEASUREMENT_UNIT_Y + MEASUREMENT_UNIT_PX + 5}
              stroke="var(--color-accent-deep)"
              strokeWidth="3"
              strokeDasharray="5 4"
              aria-hidden="true"
            />
          ) : null}
        </svg>
      </div>

      <div className="flex justify-center">
        <Button
          variant="soft"
          size="kid"
          onClick={onAdd}
          disabled={disabled || unitIds.length >= 12}
          aria-label={`Add one ${meta.singular}`}
        >
          <PlusIcon weight="bold" aria-hidden="true" />
          Add {meta.singular}
        </Button>
      </div>
    </motion.div>
  );
}
