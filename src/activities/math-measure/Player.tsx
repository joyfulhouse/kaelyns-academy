"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
  analyzeUnitPlacements,
  balanceAngle,
  balanceTiltDirection,
  comparisonDescription,
  deriveComparisonIndex,
  MAX_MEASUREMENT_UNITS,
  MEASUREMENT_UNIT_PX,
  measurementExtent,
  reduceUnitPlacements,
  rotatePoint,
  scaledExtent,
  snapToUnitSlot,
  type UnitPlacement,
  type UnitPlacementIssue,
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

function measurementFeedback(issue: UnitPlacementIssue): string {
  const message: Record<Exclude<UnitPlacementIssue, "none">, string> = {
    alignment: "Start the first unit at the start line.",
    gap: "There is a gap. Move the units so their edges just touch.",
    overlap: "Some units overlap. Move them so their edges just touch.",
    "past-target": "A unit reaches past the object. Move or remove it.",
    short: "Your connected units stop before the object ends. Place another unit.",
  };
  return issue === "none" ? "The measurement is ready." : message[issue];
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
  const [placements, setPlacements] = useState<UnitPlacement[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<"new" | string | null>(null);
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

  function selectNewUnit() {
    if (parsed.mode !== "units" || shake.wrong || placements.length >= MAX_MEASUREMENT_UNITS) {
      return;
    }
    setSelectedUnit("new");
    setFeedback(null);
    setAnnouncement(`${UNIT_META[parsed.unit].singular} selected. Choose a position on the measurement line.`);
  }

  function removeUnit(unitId: string) {
    if (parsed.mode !== "units" || shake.wrong) return;
    const nextPlacements = reduceUnitPlacements(placements, { type: "remove", id: unitId });
    if (nextPlacements === placements) return;
    setPlacements(nextPlacements);
    setSelectedUnit((selected) => (selected === unitId ? null : selected));
    setFeedback(null);
    const analysis = analyzeUnitPlacements(nextPlacements, parsed.length);
    setAnnouncement(`${analysis.validCount} ${UNIT_META[parsed.unit].plural} aligned from the start.`);
  }

  function clearUnits() {
    setPlacements((current) => reduceUnitPlacements(current, { type: "clear" }));
    setSelectedUnit(null);
    setFeedback(null);
    setAnnouncement("Measurement line cleared.");
  }

  function commitUnitAtSlot(source: "new" | string, slot: number) {
    if (parsed.mode !== "units" || shake.wrong) return;
    const isNew = source === "new";
    if (isNew && placements.length >= MAX_MEASUREMENT_UNITS) return;
    const unitId = isNew ? `unit-${nextUnit.current}` : source;
    const action = isNew
      ? ({ type: "place", placement: { id: unitId, slot } } as const)
      : ({ type: "move", id: unitId, slot } as const);
    const nextPlacements = reduceUnitPlacements(placements, action);
    if (nextPlacements === placements) return;
    if (isNew) nextUnit.current += 1;
    setPlacements(nextPlacements);
    setSelectedUnit(null);
    setFeedback(null);
    const analysis = analyzeUnitPlacements(nextPlacements, parsed.length);
    setAnnouncement(
      `${UNIT_META[parsed.unit].singular} snapped to position ${slot + 1}. ${analysis.validCount} aligned from the start.`,
    );
  }

  function placeSelectedAtSlot(slot: number) {
    if (selectedUnit === null) return;
    commitUnitAtSlot(selectedUnit, slot);
  }

  function checkUnits() {
    if (parsed.mode !== "units" || shake.wrong) return;
    const attemptCount = Math.min(attempts + 1, 20);
    const analysis = analyzeUnitPlacements(placements, parsed.length);
    setAttempts(attemptCount);
    if (analysis.issue === "none") {
      const response: MathMeasureResponse = {
        attempts: attemptCount,
        placements: placements.map((placement) => ({ ...placement })),
      };
      onComplete(response);
      return;
    }
    const message = measurementFeedback(analysis.issue);
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
          placements={placements}
          selectedUnit={selectedUnit}
          onSelectNew={selectNewUnit}
          onSelectUnit={setSelectedUnit}
          onPlaceSelected={placeSelectedAtSlot}
          onCommitAtSlot={commitUnitAtSlot}
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
            Measurement count: {analyzeUnitPlacements(placements, parsed.length).validCount}{" "}
            {UNIT_META[parsed.unit].plural}
          </span>
          <span className="block">
            {placements.length} placed. Snap equal units edge to edge from the start line.
          </span>
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
            disabled={placements.length === 0 || shake.wrong}
          >
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        {parsed.mode === "units" ? (
          <Button
            variant="soft"
            size="md"
            onClick={() => {
              if (selectedUnit && selectedUnit !== "new") removeUnit(selectedUnit);
            }}
            disabled={selectedUnit === null || selectedUnit === "new" || shake.wrong}
          >
            Remove selected
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
  const description = comparisonDescription(config.attribute, config.items);
  const descriptionId = "measurement-comparison-description";
  if (config.attribute === "height") {
    const baselineY = 188;
    return (
      <>
        <p id={descriptionId} className="sr-only">
          {description}
        </p>
        <svg
          viewBox="0 0 600 220"
          role="img"
          aria-label="Height comparison"
          aria-describedby={descriptionId}
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
      </>
    );
  }

  const rowHeight = 46;
  const viewHeight = config.items.length * rowHeight + 24;
  return (
    <>
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
      <svg
        viewBox={`0 0 600 ${viewHeight}`}
        role="img"
        aria-label="Length comparison"
        aria-describedby={descriptionId}
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
    </>
  );
}

function WeightBalance({ config }: { config: CompareConfig }) {
  const [left, right] = config.items;
  const angle = balanceAngle(left.size, right.size);
  const tilt = balanceTiltDirection(left.size, right.size);
  const pivot = { x: 280, y: 88 };
  const leftAttachment = rotatePoint({ x: 135, y: 88 }, pivot, angle);
  const rightAttachment = rotatePoint({ x: 425, y: 88 }, pivot, angle);
  const descriptionId = "measurement-comparison-description";
  return (
    <>
      <p id={descriptionId} className="sr-only">
        {comparisonDescription(config.attribute, config.items)}
      </p>
      <svg
        viewBox="0 0 560 270"
        role="img"
        aria-label={`Balance comparing ${left.label} and ${right.label}`}
        aria-describedby={descriptionId}
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
    </>
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
  placements,
  selectedUnit,
  onSelectNew,
  onSelectUnit,
  onPlaceSelected,
  onCommitAtSlot,
  onRemove,
  disabled,
  reduced,
  shake,
}: {
  config: UnitsConfig;
  placements: UnitPlacement[];
  selectedUnit: "new" | string | null;
  onSelectNew: () => void;
  onSelectUnit: (unitId: string) => void;
  onPlaceSelected: (slot: number) => void;
  onCommitAtSlot: (source: "new" | string, slot: number) => void;
  onRemove: (unitId: string) => void;
  disabled: boolean;
  reduced: boolean;
  shake: ReturnType<typeof useWrongShake>;
}) {
  const meta = UNIT_META[config.unit];
  const objectLabel = config.objectLabel ?? "object";
  const targetWidth = measurementExtent(config.length);
  const analysis = analyzeUnitPlacements(placements, config.length);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    source: "new" | string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragSlot, setDragSlot] = useState<number | null>(null);

  function pointerSlot(clientX: number): number | null {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return snapToUnitSlot(clientX, bounds.left, bounds.width, MAX_MEASUREMENT_UNITS);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, source: "new" | string) {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragRef.current = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) {
      drag.moved = true;
      setDragSlot(pointerSlot(event.clientX));
      event.preventDefault();
    }
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const slot = drag.moved ? pointerSlot(event.clientX) : null;
    if (drag.moved) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (slot !== null) onCommitAtSlot(drag.source, slot);
    }
    dragRef.current = null;
    setDragSlot(null);
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragSlot(null);
  }

  function selectAfterPointer(action: () => void) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action();
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, placement: UnitPlacement) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(placement.id);
      return;
    }

    let slot: number | null = null;
    if (event.key === "ArrowLeft") slot = placement.slot - 1;
    if (event.key === "ArrowRight") slot = placement.slot + 1;
    if (event.key === "Home") slot = 0;
    if (slot === null || slot < 0 || slot >= MAX_MEASUREMENT_UNITS) return;
    event.preventDefault();
    onCommitAtSlot(placement.id, slot);
  }

  return (
    <motion.div className="grid gap-5" {...shake.shakeProps(reduced)}>
      <div className="overflow-x-auto pb-2">
        <div
          role="group"
          aria-label={`${objectLabel} and positional ${meta.plural} on one measurement line`}
          data-testid="measurement-workspace"
          data-unit-px={MEASUREMENT_UNIT_PX}
          className="relative mx-auto grid gap-3 rounded-3xl border-[3px] border-ink/15 bg-paper-sunk px-7 py-5"
          style={{ width: MEASUREMENT_WORKSPACE_WIDTH }}
        >
          <span className="font-display text-sm text-accent-deep">START</span>
          <div className="relative" style={{ width: measurementExtent(MAX_MEASUREMENT_UNITS) }}>
            <div
              data-testid="measurement-target"
              data-unit-count={config.length}
              data-unit-px={MEASUREMENT_UNIT_PX}
              data-endpoint={targetWidth}
              className="grid h-12 place-items-center rounded-2xl border-[3px] border-ink bg-honey font-display text-base text-ink"
              style={{ width: targetWidth }}
            >
              {objectLabel}
            </div>
            <div
              aria-hidden="true"
              className="absolute -left-1 top-0 h-36 w-1 rounded-full bg-accent-deep"
            />
          </div>

          <span className="font-display text-sm text-ink">Your equal units</span>
          <div
            ref={trackRef}
            role="group"
            aria-label={`Twelve snap positions for ${meta.plural}`}
            data-testid="measurement-track"
            className="relative h-20 border-b-[4px] border-ink bg-paper-raised"
            style={{ width: measurementExtent(MAX_MEASUREMENT_UNITS) }}
          >
            {Array.from({ length: MAX_MEASUREMENT_UNITS }, (_, slot) => {
              const count = placements.filter((placement) => placement.slot === slot).length;
              return (
                <button
                  key={slot}
                  type="button"
                  aria-label={`Position ${slot + 1}, ${count === 0 ? "empty" : `${count} ${count === 1 ? meta.singular : meta.plural}`}`}
                  disabled={disabled || selectedUnit === null}
                  onClick={() => onPlaceSelected(slot)}
                  data-snap-slot={slot}
                  className="absolute bottom-0 h-full border-r border-dashed border-ink/25 bg-transparent transition hover:bg-honey/25 focus-visible:z-30 focus-visible:bg-honey/35 focus-visible:outline-4 focus-visible:outline-accent-deep disabled:pointer-events-none"
                  style={{ left: measurementExtent(slot), width: MEASUREMENT_UNIT_PX }}
                />
              );
            })}

            <div
              aria-hidden="true"
              data-testid="measurement-valid-span"
              data-unit-count={analysis.validCount}
              data-endpoint={measurementExtent(analysis.validCount)}
              className="absolute -bottom-1 left-0 z-20 h-1 bg-success"
              style={{ width: measurementExtent(analysis.validCount) }}
            />

            <div
              role="group"
              aria-label={`Placed ${meta.plural}`}
              data-testid="measurement-units"
              data-unit-count={placements.length}
              data-valid-count={analysis.validCount}
            >
              {placements.map((placement) => {
                const stack = placements
                  .filter((candidate) => candidate.slot === placement.slot)
                  .findIndex((candidate) => candidate.id === placement.id);
                const selected = selectedUnit === placement.id;
                const acceptsSelectedUnit =
                  selectedUnit !== null && selectedUnit !== placement.id;
                return (
                  <button
                    key={placement.id}
                    type="button"
                    aria-label={
                      acceptsSelectedUnit
                        ? `Place selected ${meta.singular} at occupied position ${placement.slot + 1}`
                        : `Select ${meta.singular} at position ${placement.slot + 1}`
                    }
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() =>
                      selectAfterPointer(() => {
                        if (acceptsSelectedUnit && selectedUnit) {
                          onCommitAtSlot(selectedUnit, placement.slot);
                        } else {
                          onSelectUnit(placement.id);
                        }
                      })
                    }
                    onKeyDown={(event) => moveWithKeyboard(event, placement)}
                    onPointerDown={(event) => beginDrag(event, placement.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={finishDrag}
                    onPointerCancel={cancelDrag}
                    onLostPointerCapture={cancelDrag}
                    data-unit-id={placement.id}
                    data-slot={placement.slot}
                    className="absolute z-10 grid touch-none place-items-center rounded-lg border-[3px] border-ink font-display text-xs font-bold text-ink shadow-sm transition focus-visible:z-30 focus-visible:outline-4 focus-visible:outline-accent-deep disabled:pointer-events-none disabled:opacity-50"
                    style={{
                      left: measurementExtent(placement.slot),
                      bottom: Math.min(stack, 2) * 7,
                      width: MEASUREMENT_UNIT_PX,
                      height: MEASUREMENT_UNIT_PX,
                      backgroundColor: meta.fill,
                      transform: selected ? "translateY(-4px)" : undefined,
                    }}
                  >
                    {meta.short}
                  </button>
                );
              })}
            </div>

            {dragSlot !== null ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 z-20 h-full rounded-lg bg-accent/35 ring-4 ring-accent-deep"
                style={{ left: measurementExtent(dragSlot), width: MEASUREMENT_UNIT_PX }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          variant="soft"
          size="kid"
          onClick={() => selectAfterPointer(onSelectNew)}
          onPointerDown={(event) => beginDrag(event, "new")}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          disabled={disabled || placements.length >= MAX_MEASUREMENT_UNITS}
          aria-label={`Select one ${meta.singular} to place`}
          aria-pressed={selectedUnit === "new"}
          className="touch-none"
        >
          <PlusIcon weight="bold" aria-hidden="true" />
          Pick up a {meta.singular}
        </Button>
      </div>
    </motion.div>
  );
}
