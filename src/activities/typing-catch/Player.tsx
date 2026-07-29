"use client";

import { useEffect, useRef, useState } from "react";
import {
  HeartIcon,
  PauseIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { TypingCatchConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StarShape } from "@/components/ui/Stars";
import { cn } from "@/lib/cn";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { TypingStage } from "../_shared/typing/TypingStage";
import { isCapitalKey } from "../_shared/typing/keys";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { fallMs, schema, type TypingCatchResponse } from "./logic";
import {
  initialCatchState,
  resolveAirborne,
  roundOver,
  tick,
  typeChar,
} from "./state";
import { useDocumentHidden, useRoundPaused } from "./useRoundPaused";

const TICK_MS = 100;
const PAUSE_MESSAGE = "Paused — click to keep playing";

const SPOKEN_TARGETS: Readonly<Record<string, string>> = {
  " ": "space",
  ";": "semicolon",
  ",": "comma",
  ".": "period",
  "/": "slash",
};

export function spawnAnnouncement(pool: readonly string[], spawnCount: number): string {
  if (pool.length === 0 || spawnCount <= 0) return "";
  const target = pool[(spawnCount - 1) % pool.length]!;
  if (target === target.toUpperCase() && target !== target.toLowerCase()) {
    return `Hold shift, then type ${target}`;
  }
  const spoken = SPOKEN_TARGETS[target] ?? target.toUpperCase();
  return `Type ${spoken}`;
}

export function TypingCatchPlayer(
  props: ActivityPlayerProps<TypingCatchConfig, TypingCatchResponse>,
) {
  return (
    <TypingStage onExit={props.onExit}>
      <CatchRound {...props} />
    </TypingStage>
  );
}

export function PauseOverlay({
  paused,
  onResume,
}: {
  paused: boolean;
  onResume: () => void;
}) {
  const speech = useSpeech();
  const cancelSpeech = speech.cancel;
  const hidden = useDocumentHidden();
  // A hidden tab pauses the round too, but nobody is looking at the overlay —
  // announcing there talks to an empty room. Speak only when the page shows.
  useSpeakOnce(speech.speak, paused && !hidden ? PAUSE_MESSAGE : null);

  useEffect(
    () => () => {
      cancelSpeech();
    },
    [cancelSpeech],
  );

  if (!paused) return null;
  return (
    <button
      type="button"
      onClick={() => {
        cancelSpeech();
        onResume();
      }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-honey bg-paper/95 px-6 text-center text-xl font-semibold text-ink shadow-lg"
    >
      <PauseIcon size={72} weight="fill" className="text-honey-deep" aria-hidden />
      <span>{PAUSE_MESSAGE}</span>
    </button>
  );
}

export function HeartMeter({
  lives,
  maxLives,
}: {
  lives: number;
  maxLives: number;
}) {
  return (
    <>
      <span
        className="flex items-center gap-2"
        role="img"
        aria-label={`${lives} of ${maxLives} hearts left`}
      >
        {Array.from({ length: maxLives }, (_, index) => {
          const available = index < lives;
          return (
            <HeartIcon
              key={index}
              size={32}
              weight={available ? "fill" : "regular"}
              className={cn(
                available ? "text-coral" : "animate-heart-loss text-ink-soft",
              )}
              aria-hidden
            />
          );
        })}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {lives} {lives === 1 ? "heart" : "hearts"} left
      </span>
    </>
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
  const paused = useRoundPaused();
  // The round's clock lives in a ref so the interval can read and advance it
  // without an impure state updater (which StrictMode would double-invoke).
  const elapsedRef = useRef(0);
  const finished = useRef(false);
  const announcementRef = useRef<HTMLParagraphElement>(null);

  useSpeakOnce(speech.speak, parsed.instruction);

  // A single interval drives the round. The clock pauses while the tab is
  // hidden or its window loses focus: a parent taking the laptop mid-round
  // must not cost hearts or corrupt the rate — with no pause, both the hearts
  // and the WPM would lie.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused || finished.current) return;
      elapsedRef.current += TICK_MS;
      const now = elapsedRef.current;
      setElapsedMs(now);
      setState((current) => tick(current, parsed, now));
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [parsed, paused]);

  // Whether the round is over is derived in render, not read from a ref: the
  // keydown subscription below needs it, and reading a ref during render is
  // both a lint error and a real staleness bug.
  const endedBy = roundOver(state, parsed, elapsedMs);

  useEffect(() => {
    if (!endedBy || finished.current) return;
    finished.current = true;
    const completedState = resolveAirborne(state, elapsedMs);
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
    if (intent.type !== "char" || endedBy || paused) return;
    setState((current) => typeChar(current, parsed, intent, elapsedRef.current));
  }, endedBy === null && !paused);

  // Keep React's live-region node empty on mount, then register each spawn as
  // one discrete announcement. Depending only on nextId means catching or
  // landing a star never re-reads an older target or the whole sky.
  useEffect(() => {
    const region = announcementRef.current;
    if (region === null) return;
    region.textContent = spawnAnnouncement(parsed.pool, state.nextId);
  }, [parsed.pool, state.nextId]);

  const fall = fallMs(parsed);
  const caught = state.results.filter((result) => result.ok).length;
  const secondsLeft = Math.max(0, Math.ceil(parsed.durationSec - elapsedMs / 1_000));
  const resumeRound = () => {
    window.focus();
  };
  return (
    <div className="relative flex flex-col items-center gap-6">
      {paused && <PauseOverlay paused onResume={resumeRound} />}
      <Prompt speech={speech} instruction={parsed.instruction} />
      <div className="flex items-center gap-6">
        <HeartMeter lives={state.lives} maxLives={parsed.lives} />
        <ProgressRing
          value={secondsLeft / parsed.durationSec}
          size={64}
          stroke={6}
          label={`${secondsLeft} seconds left`}
        >
          <span className="text-lg font-semibold text-ink">{secondsLeft}s</span>
        </ProgressRing>
      </div>

      <p ref={announcementRef} className="sr-only" aria-live="polite" aria-atomic="true" />

      {/* Reduced motion is a path, not a downgrade: nothing falls, the same
          stars queue up with a discrete countdown, and every rule and score
          comes from the same state.ts either way. */}
      <div
        data-playfield="true"
        className={cn(
          "relative w-full max-w-2xl overflow-hidden rounded-2xl bg-paper-sunk",
          reducedMotion
            ? "flex flex-wrap items-start justify-center gap-4 py-6"
            : "typing-playfield",
        )}
      >
        <span
          data-ground-line="true"
          className="absolute inset-x-0 bottom-0 border-t-2 border-ink-soft"
          aria-hidden="true"
        />
        {state.targets.map((target) => {
          const remainingMs = Math.max(0, target.spawnedMs + fall - elapsedMs);
          return (
            <span
              key={target.id}
              className={cn(
                "flex flex-col items-center gap-1",
                !reducedMotion && "absolute left-1/2 top-0",
              )}
              aria-hidden
              style={
                reducedMotion
                  ? undefined
                  : {
                      animationName: "typing-star-fall",
                      animationDuration: `${fall}ms`,
                      animationTimingFunction: "linear",
                      animationFillMode: "forwards",
                      animationPlayState: paused ? "paused" : "running",
                    }
              }
            >
              <span
                data-falling={target.text}
                className="relative grid size-16 place-items-center text-2xl font-bold text-ink"
              >
                <StarShape
                  size={64}
                  strokeWidth={1.125}
                  className="absolute inset-0"
                />
                <span className="relative">
                  {isCapitalKey(target.text)
                    ? `⇧${target.text}`
                    : target.text.toUpperCase()}
                </span>
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

      <div data-catch-progress="true" className="flex flex-col items-center gap-1">
        <span className="flex items-center gap-2" aria-hidden="true">
          <StarShape size={40} />
          <span className="font-display text-2xl font-semibold text-ink">{caught}</span>
        </span>
        <ProgressHint live={false}>Caught {caught}</ProgressHint>
      </div>
    </div>
  );
}
