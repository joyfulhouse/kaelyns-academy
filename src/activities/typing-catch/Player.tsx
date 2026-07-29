"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import type { TypingCatchConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { schema, type TypingCatchResponse } from "./logic";
import {
  fallMs,
  finishTimedRound,
  initialCatchState,
  roundIsPaused,
  roundOver,
  tick,
  typeChar,
} from "./state";

const TICK_MS = 100;

export function TypingCatchPlayer(
  props: ActivityPlayerProps<TypingCatchConfig, TypingCatchResponse>,
) {
  return (
    <TypingStage>
      <CatchRound {...props} />
    </TypingStage>
  );
}

function CatchRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingCatchConfig, TypingCatchResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reducedMotion = useReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [state, setState] = useState(() => initialCatchState(parsed, 0));
  // The round's clock lives in a ref so the interval can read and advance it
  // without an impure state updater (which StrictMode would double-invoke).
  const elapsedRef = useRef(0);
  const finished = useRef(false);

  useSpeakOnce(speech.speak, parsed.instruction);

  // A single interval drives the round. The clock pauses while the tab is
  // hidden or its window loses focus: a parent taking the laptop mid-round
  // must not cost hearts or corrupt the rate — with no pause, both the hearts
  // and the WPM would lie.
  useEffect(() => {
    let windowFocused = document.hasFocus();
    let paused = roundIsPaused(document.hidden, windowFocused);
    const onVisibility = () => {
      paused = roundIsPaused(document.hidden, windowFocused);
    };
    const onBlur = () => {
      windowFocused = false;
      paused = true;
    };
    const onFocus = () => {
      windowFocused = true;
      paused = roundIsPaused(document.hidden, windowFocused);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => {
      if (paused || finished.current) return;
      elapsedRef.current += TICK_MS;
      const now = elapsedRef.current;
      setElapsedMs(now);
      setState((current) => tick(current, parsed, now));
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [parsed]);

  // Whether the round is over is derived in render, not read from a ref: the
  // keydown subscription below needs it, and reading a ref during render is
  // both a lint error and a real staleness bug.
  const endedBy = roundOver(state, parsed, elapsedMs);

  useEffect(() => {
    if (!endedBy || finished.current) return;
    finished.current = true;
    const completedState =
      endedBy === "time" ? finishTimedRound(state, elapsedMs) : state;
    onComplete({
      // The response schema needs at least one prompt. A round this long always
      // resolves at least one star, so this fallback is defensive only.
      prompts:
        completedState.results.length > 0
          ? completedState.results
          : [{ text: parsed.pool[0]!, ok: false, ms: 0 }],
      endedBy,
      elapsedMs,
    });
  }, [endedBy, state, parsed, elapsedMs, onComplete]);

  useTypingKeys((intent) => {
    if (intent.type !== "char" || endedBy) return;
    setState((current) => typeChar(current, parsed, intent.char, elapsedRef.current));
  }, endedBy === null);

  const fall = fallMs(parsed);
  const caught = state.results.filter((result) => result.ok).length;
  const secondsLeft = Math.max(0, Math.ceil(parsed.durationSec - elapsedMs / 1_000));
  const targetAnnouncement =
    state.targets.length === 0
      ? "Get ready"
      : `Type ${state.targets
          .map((target) =>
            target.text === target.text.toUpperCase() &&
            target.text !== target.text.toLowerCase()
              ? `capital ${target.text}`
              : target.text.toUpperCase(),
          )
          .join(", ")}`;

  return (
    <div className="flex flex-col items-center gap-6">
      <Prompt speech={speech} instruction={parsed.instruction} />
      <div className="flex items-center gap-6">
        <span
          className="flex items-center gap-2"
          role="img"
          aria-label={`${state.lives} of ${parsed.lives} hearts left`}
        >
          {Array.from({ length: parsed.lives }, (_, index) => (
            <HeartIcon
              key={index}
              size={32}
              weight={index < state.lives ? "fill" : "regular"}
              className={cn(index < state.lives ? "text-coral" : "text-ink-soft/30")}
              aria-hidden
            />
          ))}
        </span>
        <span className="text-lg font-semibold text-ink">{secondsLeft}s</span>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {targetAnnouncement}
      </p>

      {/* Reduced motion is a path, not a downgrade: nothing falls, the same
          stars queue up with a discrete countdown, and every rule and score
          comes from the same state.ts either way. */}
      <div
        className={cn(
          "relative w-full max-w-2xl",
          reducedMotion
            ? "flex flex-wrap items-start justify-center gap-4 py-6"
            : "h-72 overflow-hidden",
        )}
      >
        {state.targets.map((target) => {
          const remainingMs = Math.max(0, target.spawnedMs + fall - elapsedMs);
          const progress = Math.min(1, (elapsedMs - target.spawnedMs) / fall);
          return (
            <span
              key={target.id}
              className={cn(
                "flex flex-col items-center gap-1",
                !reducedMotion && "absolute left-1/2 -translate-x-1/2",
              )}
              aria-hidden
              // Offset by the sprite's own 4rem height so progress 1 rests it
              // ON the ground line rather than clipping it out of the sky.
              style={
                reducedMotion ? undefined : { top: `calc(${progress} * (100% - 4rem))` }
              }
            >
              <span
                data-falling={target.text}
                className="grid size-16 place-items-center rounded-full bg-honey text-2xl font-bold text-ink"
              >
                {target.text.toUpperCase()}
              </span>
              {reducedMotion && (
                <span className="text-sm text-ink-soft">
                  {Math.ceil(remainingMs / 1_000)}
                </span>
              )}
            </span>
          );
        })}
        {state.targets.length === 0 && (
          <span
            className={cn("grid place-items-center", !reducedMotion && "absolute inset-0")}
          >
            <StarIcon size={40} className="text-honey/40" aria-hidden />
          </span>
        )}
      </div>

      <ProgressHint>Caught {caught}</ProgressHint>
    </div>
  );
}
