"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion } from "motion/react";
import type { MathClockConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import {
  anglesForTime,
  normalizeHalfHour,
  pointerAngle,
  snapPointerToHalfHour,
  timeFromTotalMinutes,
  unwrapAngle,
  type ClockHand,
} from "./clock-model";
import { schema, type MathClockResponse } from "./logic";

function displayTime(totalMinutes: number): string {
  const { hour, minute } = timeFromTotalMinutes(totalMinutes);
  return `${hour}:${minute === 0 ? "00" : "30"}`;
}

function authoredTime(hour: number, minute: 0 | 30): number {
  return normalizeHalfHour((hour % 12) * 60 + minute);
}

export function MathClockPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathClockConfig, MathClockResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [attempts, setAttempts] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [hasManipulatedHands, setHasManipulatedHands] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useSpeakOnce(speech.speak, parsed.instruction);

  function tapChoice(index: number) {
    if (parsed.mode !== "read" || shake.wrong) return;
    const attemptCount = Math.min(attempts + 1, 20);
    if (index === parsed.answerIndex) {
      const response: MathClockResponse = { attempts: attemptCount, selectedIndex: index };
      onComplete(response);
      return;
    }
    const message = "That time does not match yet. Try another choice.";
    setAttempts(attemptCount);
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak("Try another time.") });
  }

  function changeTimeFromHands(nextTotalMinutes: number) {
    if (shake.wrong) return;
    const normalized = normalizeHalfHour(nextTotalMinutes);
    if (normalized === totalMinutes) return;
    setFeedback(null);
    setHasManipulatedHands(true);
    setTotalMinutes(normalized);
  }

  function check() {
    if (parsed.mode !== "set" || shake.wrong || !hasManipulatedHands) return;
    const attemptCount = Math.min(attempts + 1, 20);
    setAttempts(attemptCount);
    if (totalMinutes === authoredTime(parsed.targetHour, parsed.targetMinute)) {
      const response: MathClockResponse = { attempts: attemptCount, totalMinutes };
      onComplete(response);
      return;
    }
    const message = "That time is not quite right. Keep the hands and try again.";
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak("Not quite. Keep the hands and try again.") });
  }

  const shownTotalMinutes =
    parsed.mode === "read" ? authoredTime(parsed.hour, parsed.minute) : totalMinutes;

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <motion.div className="grid justify-items-center gap-6" {...shake.shakeProps(reduced)}>
        <ClockFace
          totalMinutes={shownTotalMinutes}
          interactive={parsed.mode === "set"}
          disabled={shake.wrong}
          onChange={changeTimeFromHands}
        />

        {parsed.mode === "read" ? (
          <div
            role="group"
            aria-label="Digital time choices"
            className="mx-auto grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-3"
          >
            {parsed.choices.map((choiceLabel, index) => (
              <button
                key={`${choiceLabel}-${index}`}
                type="button"
                onClick={() => tapChoice(index)}
                disabled={shake.wrong}
                aria-label={`Digital time ${choiceLabel}`}
                className="min-h-24 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-4 font-display text-2xl text-ink shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50"
              >
                {choiceLabel}
              </button>
            ))}
          </div>
        ) : null}
      </motion.div>

      <ProgressHint>
        {parsed.mode === "set" ? (
          <>
            <span className="block font-display text-lg text-ink">
              Current time: {displayTime(totalMinutes)}
            </span>
            <span className="block">
              Drag or tap either hand. You can also focus a hand and use the arrow keys.
            </span>
          </>
        ) : (
          "Tap the digital time that matches the clock."
        )}
        {feedback ? <span className="mt-2 block font-semibold text-ink">{feedback}</span> : null}
      </ProgressHint>

      <PlayerControls>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {parsed.mode === "set" ? (
          <Button
            variant="primary"
            size="kid"
            onClick={check}
            disabled={shake.wrong || !hasManipulatedHands}
          >
            Check it
          </Button>
        ) : null}
      </PlayerControls>
    </div>
  );
}

const VIEW_SIZE = 240;
const CENTER = VIEW_SIZE / 2;
const FACE_RADIUS = 108;
const HOUR_HAND_LENGTH = 58;
const MINUTE_HAND_LENGTH = 82;

const TICKS = Array.from({ length: 60 }, (_, index) => {
  const angle = (index * 6 - 90) * (Math.PI / 180);
  const isHour = index % 5 === 0;
  const outer = FACE_RADIUS - 8;
  const inner = isHour ? FACE_RADIUS - 22 : FACE_RADIUS - 14;
  return {
    x1: CENTER + outer * Math.cos(angle),
    y1: CENTER + outer * Math.sin(angle),
    x2: CENTER + inner * Math.cos(angle),
    y2: CENTER + inner * Math.sin(angle),
    isHour,
  };
});

const NUMERALS = Array.from({ length: 12 }, (_, index) => {
  const numeral = index + 1;
  const angle = (numeral * 30 - 90) * (Math.PI / 180);
  const radius = FACE_RADIUS - 37;
  return {
    numeral,
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
});

interface DragState {
  hand: ClockHand;
  pointerId: number;
  startTotalMinutes: number;
  startPointerAngle: number;
  lastPointerAngle: number;
  changed: boolean;
}

function ClockFace({
  totalMinutes,
  interactive,
  disabled,
  onChange,
}: {
  totalMinutes: number;
  interactive: boolean;
  disabled: boolean;
  onChange: (totalMinutes: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);
  const { hourAngle, minuteAngle } = anglesForTime(totalMinutes);
  const timeLabel = displayTime(totalMinutes);

  function beginDrag(event: PointerEvent<SVGGElement>, hand: ClockHand) {
    if (!interactive || disabled || !svgRef.current) return;
    event.preventDefault();
    const angle = pointerAngle(event.clientX, event.clientY, svgRef.current.getBoundingClientRect());
    drag.current = {
      hand,
      pointerId: event.pointerId,
      startTotalMinutes: totalMinutes,
      startPointerAngle: angle,
      lastPointerAngle: angle,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<SVGGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !svgRef.current) return;
    event.preventDefault();
    const wrapped = pointerAngle(event.clientX, event.clientY, svgRef.current.getBoundingClientRect());
    const unwrapped = unwrapAngle(active.lastPointerAngle, wrapped);
    active.lastPointerAngle = unwrapped;
    const nextTotalMinutes = snapPointerToHalfHour(
      active.startTotalMinutes,
      unwrapped - active.startPointerAngle,
      active.hand,
    );
    if (nextTotalMinutes !== active.startTotalMinutes) active.changed = true;
    onChange(nextTotalMinutes);
  }

  function endDrag(event: PointerEvent<SVGGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!active.changed) onChange(active.startTotalMinutes + 30);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelDrag(event: PointerEvent<SVGGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    onChange(active.startTotalMinutes);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function lostCapture(event: PointerEvent<SVGGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    onChange(active.startTotalMinutes);
  }

  function keyStep(event: KeyboardEvent<SVGGElement>) {
    if (!interactive || disabled) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(totalMinutes - 30);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(totalMinutes + 30);
    }
  }

  const role = interactive ? "group" : "img";
  const label = interactive
    ? `Interactive clock showing ${timeLabel}`
    : "Analog clock face. Read the hour and minute hands, then choose the matching digital time.";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      role={role}
      aria-label={label}
      className="mx-auto h-auto w-full max-w-xs touch-none select-none"
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={FACE_RADIUS}
        fill="var(--color-paper-raised)"
        stroke="var(--color-ink)"
        strokeWidth={4}
      />
      {TICKS.map((tick, index) => (
        <line
          key={index}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="var(--color-ink)"
          strokeWidth={tick.isHour ? 3 : 1.5}
          strokeLinecap="round"
          aria-hidden="true"
        />
      ))}
      {NUMERALS.map(({ numeral, x, y }) => (
        <text
          key={numeral}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-ink)"
          fontSize={17}
          fontWeight={700}
          aria-hidden="true"
        >
          {numeral}
        </text>
      ))}

      <ClockHandControl
        hand="hour"
        angle={hourAngle}
        length={HOUR_HAND_LENGTH}
        width={8}
        color="var(--color-ink)"
        timeLabel={timeLabel}
        totalMinutes={totalMinutes}
        interactive={interactive}
        disabled={disabled}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={lostCapture}
        onKeyDown={keyStep}
      />
      <ClockHandControl
        hand="minute"
        angle={minuteAngle}
        length={MINUTE_HAND_LENGTH}
        width={6}
        color="var(--color-accent-deep)"
        timeLabel={timeLabel}
        totalMinutes={totalMinutes}
        interactive={interactive}
        disabled={disabled}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={lostCapture}
        onKeyDown={keyStep}
      />
      <circle cx={CENTER} cy={CENTER} r={7} fill="var(--color-ink)" aria-hidden="true" />
    </svg>
  );
}

function ClockHandControl({
  hand,
  angle,
  length,
  width,
  color,
  timeLabel,
  totalMinutes,
  interactive,
  disabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onKeyDown,
}: {
  hand: ClockHand;
  angle: number;
  length: number;
  width: number;
  color: string;
  timeLabel: string;
  totalMinutes: number;
  interactive: boolean;
  disabled: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, hand: ClockHand) => void;
  onPointerMove: (event: PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGGElement>) => void;
  onPointerCancel: (event: PointerEvent<SVGGElement>) => void;
  onLostPointerCapture: (event: PointerEvent<SVGGElement>) => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
}) {
  const name = hand === "hour" ? "Hour hand" : "Minute hand";
  const endpointY = CENTER - length;

  return (
    <g
      role={interactive ? "slider" : undefined}
      aria-label={interactive ? name : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 690 : undefined}
      aria-valuenow={interactive ? totalMinutes : undefined}
      aria-valuetext={interactive ? timeLabel : undefined}
      aria-disabled={interactive ? disabled : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      transform={`rotate(${angle} ${CENTER} ${CENTER})`}
      data-angle={angle}
      className="group cursor-grab outline-none active:cursor-grabbing"
      onPointerDown={interactive ? (event) => onPointerDown(event, hand) : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? onPointerCancel : undefined}
      onLostPointerCapture={interactive ? onLostPointerCapture : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
    >
      {interactive ? (
        <line
          data-testid={`${hand}-hand-hit-target`}
          x1={CENTER}
          y1={CENTER + 12}
          x2={CENTER}
          y2={endpointY - 10}
          stroke="transparent"
          strokeWidth={40}
          strokeLinecap="round"
        />
      ) : null}
      <line
        x1={CENTER}
        y1={CENTER + 8}
        x2={CENTER}
        y2={endpointY}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        aria-hidden="true"
      />
      {interactive ? (
        <>
          <circle
            cx={CENTER}
            cy={endpointY}
            r={13}
            fill="var(--color-paper-raised)"
            stroke={color}
            strokeWidth={4}
            aria-hidden="true"
          />
          <circle
            cx={CENTER}
            cy={endpointY}
            r={19}
            fill="none"
            stroke="var(--color-accent-deep)"
            strokeWidth={4}
            className="opacity-0 group-focus-visible:opacity-100"
            aria-hidden="true"
          />
        </>
      ) : null}
    </g>
  );
}
