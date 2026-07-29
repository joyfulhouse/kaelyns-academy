"use client";

import { useEffect, useRef, useState } from "react";
import { RocketIcon, ShootingStarIcon } from "@phosphor-icons/react/dist/ssr";
import type { TypingRaceConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Mascot } from "@/components/art/Mascot";
import { StarShape } from "@/components/ui/Stars";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { PauseOverlay } from "../_shared/typing/PauseOverlay";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useRoundPaused } from "../_shared/typing/roundPause";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { BufferTiles, ExpectedTiles } from "../_shared/typing/WordTiles";
import {
  initialWordProgress,
  isWordComplete,
  pressWordBackspace,
  pressWordKey,
  wordItemResult,
  type WordProgress,
} from "../_shared/typing/wordType";
import { wpm } from "../_shared/typing/wpm";
import { schema, type TypingRaceResponse } from "./logic";

/** How often the live readout (WPM + pace comet) refreshes while running. */
const LIVE_TICK_MS = 500;

function completedChars(words: readonly string[], index: number): number {
  return words.slice(0, index).reduce((sum, word) => sum + word.length, 0);
}

/** Characters advanced through so far, including any not-yet-corrected wrong
 *  keystroke — mirrors what the buffer tiles show, so the rocket's position
 *  always matches what's on screen. */
function typedChars(words: readonly string[], index: number, progress: WordProgress): number {
  return completedChars(words, index) + progress.typed.length;
}

/** Only characters that ended up correct — the standard WPM numerator. */
function typedCorrectChars(
  words: readonly string[],
  index: number,
  progress: WordProgress,
): number {
  return completedChars(words, index) + progress.typed.filter((entry) => entry.ok).length;
}

export function totalChars(words: readonly string[]): number {
  return words.reduce((sum, word) => sum + word.length, 0);
}

/** The pace comet's own "characters typed" at a steady pacerWpm rate — a
 *  standard word is 5 characters, so this is just the WPM formula run forward
 *  instead of back-solved from a count. */
export function pacerChars(pacerWpm: number, elapsedMs: number): number {
  return pacerWpm * 5 * (elapsedMs / 60_000);
}

/** Clamped 0..1 fraction of the track a given character count represents. */
export function raceFraction(chars: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, chars / total));
}

/** A single continuous wall clock, offset by refs (not state) so a keydown's
 *  per-word timestamp and the live-readout interval agree on "now" — pause
 *  simply stops the segment from growing, exactly like typing-catch's tick
 *  accounting, just wall-clock instead of fixed-tick. */
function currentElapsedMs(accumulatedMs: number, segmentStartMs: number | null, nowMs: number): number {
  return accumulatedMs + (segmentStartMs === null ? 0 : Math.max(0, nowMs - segmentStartMs));
}

export function TypingRacePlayer(
  props: ActivityPlayerProps<TypingRaceConfig, TypingRaceResponse>,
) {
  return (
    <TypingStage onExit={props.onExit}>
      <RaceRound {...props} />
    </TypingStage>
  );
}

interface RaceState {
  index: number;
  progress: WordProgress;
  results: TypingRaceResponse["words"];
  /** The race clock's reading the instant the last word completed — reused
   *  directly as the completion payload's `elapsedMs` so it never disagrees
   *  with the per-word `ms` values already threaded through the same clock. */
  elapsedMs: number;
}

function initialRaceState(): RaceState {
  return { index: 0, progress: initialWordProgress(), results: [], elapsedMs: 0 };
}

export function RaceRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingRaceConfig, TypingRaceResponse>) {
  const parsed = useActivity(schema, config);
  const words = parsed.words;
  const speech = useSpeech();
  const reducedMotion = useReducedMotion();
  const paused = useRoundPaused();
  const [state, setState] = useState(initialRaceState);
  const [started, setStarted] = useState(false);
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const reported = useRef(false);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  const finished = state.index >= words.length;
  const item = finished ? null : (words[state.index] ?? null);

  useSpeakOnce(speech.speak, parsed.instruction);

  // Opens a wall-clock segment for exactly as long as the round is truly
  // live; its cleanup folds the segment's duration into accumulatedRef the
  // instant the round pauses, finishes, or unmounts, so a blurred tab never
  // counts toward elapsed time. Guarded for SSR/non-browser rendering, same
  // as roundPause's own subscribe guard.
  useEffect(() => {
    if (!started || paused || finished) return;
    if (typeof window === "undefined") return;
    segmentStartRef.current = performance.now();
    const id = window.setInterval(() => {
      setLiveElapsedMs(
        Math.round(currentElapsedMs(accumulatedRef.current, segmentStartRef.current, performance.now())),
      );
    }, LIVE_TICK_MS);
    return () => {
      window.clearInterval(id);
      if (segmentStartRef.current !== null) {
        accumulatedRef.current += performance.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
    };
  }, [started, paused, finished]);

  useTypingKeys((intent) => {
    if (intent.type === "backspace") {
      setState((current) => ({ ...current, progress: pressWordBackspace(current.progress) }));
      return;
    }
    if (intent.type !== "char") return;
    if (!started) setStarted(true);
    const now = Math.round(
      currentElapsedMs(accumulatedRef.current, segmentStartRef.current, performance.now()),
    );
    setState((current) => {
      const currentWord = words[current.index];
      if (currentWord === undefined) return current;
      const nextProgress = pressWordKey(current.progress, currentWord, intent, now);
      if (!isWordComplete(nextProgress)) {
        return { ...current, progress: nextProgress };
      }
      return {
        index: current.index + 1,
        progress: initialWordProgress(),
        results: [...current.results, wordItemResult(nextProgress, current.index)],
        elapsedMs: nextProgress.completedMs ?? current.elapsedMs,
      };
    });
  }, !finished && !paused);

  // Completion is reported after React commits the final transition (mirrors
  // Word Write): the ref guards against reporting twice under StrictMode.
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onComplete({ words: state.results, elapsedMs: state.elapsedMs });
  }, [finished, onComplete, state.results, state.elapsedMs]);

  useEffect(() => {
    return () => {
      speech.cancel();
    };
  }, [speech]);

  const rocketFraction = raceFraction(typedChars(words, state.index, state.progress), totalChars(words));
  const cometFraction = raceFraction(pacerChars(parsed.pacerWpm, liveElapsedMs), totalChars(words));
  const liveWpm = wpm(typedCorrectChars(words, state.index, state.progress), liveElapsedMs);
  const resumeRound = () => {
    window.focus();
  };

  return (
    <div className="relative flex flex-col items-center gap-6">
      {paused && <PauseOverlay paused onResume={resumeRound} />}
      <Prompt speech={speech} instruction={parsed.instruction} />

      {item === null ? (
        <Mascot mood="cheer" size={96} title="Rocket Race complete" />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <ExpectedTiles item={item} />
          <BufferTiles progress={state.progress} />
        </div>
      )}

      <p aria-live="polite" className="min-h-7 text-center font-display text-lg text-ink">
        {item === null ? "" : `Type ${item}`}
      </p>

      {/* Reduced motion is a path, not a downgrade: the same word tiles and
          scoring apply either way — only the track visualization changes to a
          discrete fraction with zero transform styles. */}
      {reducedMotion ? (
        <p data-race-track="static" className="text-center text-lg font-semibold text-ink">
          {Math.min(state.index + 1, words.length)} of {words.length} words
        </p>
      ) : (
        <div
          data-race-track="true"
          aria-hidden="true"
          className="relative h-20 w-full max-w-2xl overflow-hidden rounded-2xl border-[3px] border-ink bg-paper-sunk"
        >
          {/* The pace comet — a friendly pacer, never a competitor. It sits
              behind the rocket and finishing behind it is still a complete,
              warm finish (no "you lost" framing exists anywhere here). */}
          <div
            data-race-comet="true"
            className="absolute inset-0"
            style={{
              transform: `translate3d(${cometFraction * 100}%, 0, 0)`,
              transition: "transform 500ms linear",
            }}
          >
            <span className="absolute left-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border-[3px] border-ink bg-paper-raised text-ink-soft shadow-pop">
              <ShootingStarIcon size={18} weight="fill" aria-hidden />
            </span>
          </div>
          <div
            data-race-rocket="true"
            className="absolute inset-0"
            style={{
              transform: `translate3d(${rocketFraction * 100}%, 0, 0)`,
              transition: "transform 500ms linear",
            }}
          >
            <span className="absolute left-0 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full border-[3px] border-ink bg-honey text-ink shadow-pop">
              <RocketIcon size={28} weight="fill" aria-hidden />
            </span>
          </div>
        </div>
      )}

      <p data-race-wpm="true" className="text-center text-ink">
        <span className="font-display text-2xl font-bold">{liveWpm}</span> words a minute
      </p>

      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="flex items-center gap-1.5">
          {words.map((_, i) => (
            <StarShape key={i} size={40} filled={i < state.index} emptyClassName="text-ink-soft" />
          ))}
        </span>
        <ProgressHint>
          word {Math.min(state.index + 1, words.length)} of {words.length}
        </ProgressHint>
      </div>
    </div>
  );
}
