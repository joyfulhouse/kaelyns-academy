"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathClockConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { schema, type MathClockResponse } from "./logic";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 30] as const;

function displayTime(hour: number, minute: 0 | 30): string {
  return `${hour}:${minute === 0 ? "00" : "30"}`;
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
  // set mode only: the clock the child is building. Null hour = nothing picked yet.
  const [pickedHour, setPickedHour] = useState<number | null>(null);
  const [pickedMinute, setPickedMinute] = useState<0 | 30>(0);

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  function tapChoice(index: number) {
    if (parsed.mode !== "read" || shake.wrong) return;
    const attemptCount = attempts + 1;
    if (index === parsed.answerIndex) {
      const response: MathClockResponse = { attempts: attemptCount, selectedIndex: index };
      onComplete(response);
    } else {
      setAttempts(attemptCount);
      shake.trigger({ speak: () => speech.speak("Try another time.") });
    }
  }

  function check() {
    if (parsed.mode !== "set" || pickedHour === null || shake.wrong) return;
    const attemptCount = attempts + 1;
    setAttempts(attemptCount);
    if (pickedHour === parsed.targetHour && pickedMinute === parsed.targetMinute) {
      const response: MathClockResponse = {
        attempts: attemptCount,
        setHour: pickedHour,
        setMinute: pickedMinute,
      };
      onComplete(response);
    } else {
      shake.trigger({ speak: () => speech.speak("Not quite. Try again.") });
    }
  }

  function reset() {
    setPickedHour(null);
    setPickedMinute(0);
  }

  const previewHour = parsed.mode === "read" ? parsed.hour : (pickedHour ?? 12);
  const previewMinute = parsed.mode === "read" ? parsed.minute : pickedMinute;

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <motion.div className="grid justify-items-center gap-6" {...shake.shakeProps(reduced)}>
        <ClockFace hour={previewHour} minute={previewMinute} />

        {parsed.mode === "read" ? (
          <div
            role="group"
            aria-label="Digital time choices"
            className="mx-auto grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-3"
          >
            {parsed.choices.map((choiceLabel, i) => (
              <button
                key={`${choiceLabel}-${i}`}
                type="button"
                onClick={() => tapChoice(i)}
                disabled={shake.wrong}
                aria-label={`Digital time ${choiceLabel}`}
                className={cn(
                  "min-h-24 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-4 font-display text-2xl text-ink shadow-pop transition duration-200 ease-out",
                  "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {choiceLabel}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div
              role="group"
              aria-label="Choose the hour"
              className="mx-auto grid max-w-2xl grid-cols-3 gap-3 sm:grid-cols-4"
            >
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setPickedHour(h)}
                  disabled={shake.wrong}
                  aria-label={`Set hour to ${h}`}
                  aria-pressed={pickedHour === h}
                  className={cn(
                    "grid min-h-24 place-items-center rounded-xl border-[3px] border-ink font-display text-xl text-ink shadow-pop transition duration-200 ease-out",
                    pickedHour === h ? "bg-accent" : "bg-paper-raised",
                    "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Choose the minutes" className="flex gap-3">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPickedMinute(m)}
                  disabled={shake.wrong}
                  aria-label={m === 0 ? "Set minutes to zero" : "Set minutes to thirty"}
                  aria-pressed={pickedMinute === m}
                  className={cn(
                    "min-h-24 rounded-xl border-[3px] border-ink px-8 py-3 font-display text-xl text-ink shadow-pop transition duration-200 ease-out",
                    pickedMinute === m ? "bg-accent" : "bg-paper-raised",
                    "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  :{m === 0 ? "00" : "30"}
                </button>
              ))}
            </div>
          </>
        )}
      </motion.div>

      <ProgressHint>
        {parsed.mode === "read"
          ? "Tap the time that matches the clock"
          : pickedHour === null
            ? "Tap an hour, then check"
            : `${displayTime(pickedHour, pickedMinute)} so far`}
      </ProgressHint>

      <PlayerControls>
        {parsed.mode === "set" && (
          <Button
            variant="soft"
            size="md"
            onClick={reset}
            disabled={(pickedHour === null && pickedMinute === 0) || shake.wrong}
          >
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Clear
          </Button>
        )}
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {parsed.mode === "set" && (
          <Button
            variant="primary"
            size="kid"
            onClick={check}
            disabled={pickedHour === null || shake.wrong}
          >
            Check it
          </Button>
        )}
      </PlayerControls>
    </div>
  );
}

const FACE_SIZE = 220;
const CENTER = 100;
const FACE_R = 90;
const TICK_OUTER = 84;
const TICK_INNER = 72;
const HOUR_HAND_LEN = 46;
const MINUTE_HAND_LEN = 72;

/** The 12 static hour-mark ticks, precomputed once (pure geometry, not Tailwind classes). */
const HOUR_TICKS = Array.from({ length: 12 }, (_, k) => {
  const angle = (k * 30 - 90) * (Math.PI / 180);
  return {
    x1: CENTER + TICK_OUTER * Math.cos(angle),
    y1: CENTER + TICK_OUTER * Math.sin(angle),
    x2: CENTER + TICK_INNER * Math.cos(angle),
    y2: CENTER + TICK_INNER * Math.sin(angle),
  };
});

/**
 * A pure, presentational analog clock face: inline SVG, static Tailwind classes,
 * hands rotated via an SVG `transform` (numeric geometry, not a constructed
 * class). To the half-hour only: minute 0 → minute hand at 12, minute 30 →
 * minute hand at 6 and the hour hand halfway to the next hour.
 */
function ClockFace({ hour, minute }: { hour: number; minute: 0 | 30 }) {
  const hourAngle = (hour % 12) * 30 + (minute / 60) * 30;
  const minuteAngle = minute === 30 ? 180 : 0;

  return (
    <svg
      viewBox={`0 0 ${FACE_SIZE - 20} ${FACE_SIZE - 20}`}
      width={FACE_SIZE}
      height={FACE_SIZE}
      role="img"
      aria-label={`Clock showing ${displayTime(hour, minute)}`}
      className="mx-auto"
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={FACE_R}
        fill="var(--color-paper-raised)"
        stroke="var(--color-ink)"
        strokeWidth={4}
      />
      {HOUR_TICKS.map((tick, i) => (
        <line
          key={i}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="var(--color-ink)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={CENTER}
        y2={CENTER - HOUR_HAND_LEN}
        stroke="var(--color-ink)"
        strokeWidth={6}
        strokeLinecap="round"
        transform={`rotate(${hourAngle} ${CENTER} ${CENTER})`}
      />
      <line
        x1={CENTER}
        y1={CENTER}
        x2={CENTER}
        y2={CENTER - MINUTE_HAND_LEN}
        stroke="var(--color-accent-deep)"
        strokeWidth={5}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} ${CENTER} ${CENTER})`}
      />
      <circle cx={CENTER} cy={CENTER} r={6} fill="var(--color-ink)" />
    </svg>
  );
}
