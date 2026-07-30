"use client";

import { useEffect, useRef, useState } from "react";
import { EyeClosedIcon } from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import type { TypingEchoConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Mascot } from "@/components/art/Mascot";
import { StarShape } from "@/components/ui/Stars";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { PauseOverlay } from "../_shared/typing/PauseOverlay";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useRoundPaused } from "../_shared/typing/roundPause";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { BufferTiles, ExpectedTiles } from "../_shared/typing/WordTiles";
import { wordKeyWillBeWrong } from "../_shared/typing/wordType";
import { schema, type TypingEchoResponse } from "./logic";
import {
  initialEchoState,
  isEchoComplete,
  pressEchoBackspace,
  pressEchoKey,
  tickEcho,
  type EchoState,
} from "./state";

/** The flash/recall clock's tick cadence, matching typing-catch/typing-race. */
const TICK_MS = 100;

export function TypingEchoPlayer(
  props: ActivityPlayerProps<TypingEchoConfig, TypingEchoResponse>,
) {
  return (
    <TypingStage onExit={props.onExit}>
      <EchoRound {...props} />
    </TypingStage>
  );
}

/** A single continuous wall clock, offset by refs (not state), the same
 *  accounting Rocket Race uses — pause simply stops the segment from growing,
 *  so it can drive both the flash-phase countdown and each item's indicative
 *  `ms` without disagreeing on "now". */
function currentElapsedMs(
  accumulatedMs: number,
  segmentStartMs: number | null,
  nowMs: number,
): number {
  return accumulatedMs + (segmentStartMs === null ? 0 : Math.max(0, nowMs - segmentStartMs));
}

function watchAnnouncement(sequence: string): string {
  return `Watch: ${sequence.split("").join(" ")}`;
}

export function EchoRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingEchoConfig, TypingEchoResponse>) {
  const parsed = useActivity(schema, config);
  const sequences = parsed.sequences;
  const speech = useSpeech();
  const reducedMotion = useReducedMotion();
  const shake = useWrongShake();
  const paused = useRoundPaused();
  const [state, setState] = useState<EchoState>(() => initialEchoState(0));
  const reported = useRef(false);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  const finished = isEchoComplete(state, sequences.length);
  const current = finished ? null : (sequences[state.index] ?? null);

  useSpeakOnce(speech.speak, parsed.instruction);

  // Opens a wall-clock segment for exactly as long as the round is truly
  // live; its cleanup folds the segment's duration into accumulatedRef the
  // instant the round pauses, finishes, or unmounts, so a blurred tab never
  // shortens (or lengthens) the flash a child actually sees.
  useEffect(() => {
    if (paused || finished) {
      // Fold any EVENT-OPENED segment too: a keystroke and a pause can land
      // in the same commit, in which case this effect's live branch (and its
      // cleanup) never ran for that segment — without this fold, resume's
      // ??= would keep the pre-pause timestamp and count blurred time.
      if (segmentStartRef.current !== null) {
        accumulatedRef.current += performance.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
      return;
    }
    if (typeof window === "undefined") return;
    segmentStartRef.current ??= performance.now();
    const id = window.setInterval(() => {
      const now = Math.round(
        currentElapsedMs(accumulatedRef.current, segmentStartRef.current, performance.now()),
      );
      setState((prev) => tickEcho(prev, parsed.flashMs, now));
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      if (segmentStartRef.current !== null) {
        accumulatedRef.current += performance.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
    };
  }, [paused, finished, parsed.flashMs]);

  // The listener detaches the instant the round completes (Key Camp's
  // pattern) — pressEchoKey's `expected === undefined` branch is otherwise
  // unreachable, since there is no way to type past the final sequence.
  useTypingKeys((intent) => {
    if (intent.type === "backspace") {
      setState((prev) => pressEchoBackspace(prev));
      return;
    }
    if (intent.type !== "char") return;
    if (state.phase === "recall" && current !== null && wordKeyWillBeWrong(state.progress, current, intent)) {
      shake.trigger();
    }
    const now = Math.round(
      currentElapsedMs(accumulatedRef.current, segmentStartRef.current, performance.now()),
    );
    setState((prev) => pressEchoKey(prev, sequences, intent, now));
  }, !finished);

  // Completion is reported after React commits the final transition (mirrors
  // Word Write): the ref guards against reporting twice under StrictMode.
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onComplete({ sequences: state.results });
  }, [finished, onComplete, state.results]);

  useEffect(() => {
    return () => {
      speech.cancel();
    };
  }, [speech]);

  const announcement = finished
    ? ""
    : state.phase === "flash"
      ? watchAnnouncement(current ?? "")
      : state.progress.diverged
        ? "Press Backspace to fix it"
        : "Now type what you saw";

  return (
    <div className="relative flex flex-col items-center gap-6">
      {paused && <PauseOverlay paused onResume={() => window.focus()} />}
      <Prompt speech={speech} instruction={parsed.instruction} />

      {current === null ? (
        <Mascot mood="cheer" size={96} title="Star Echo complete" />
      ) : (
        <div className="flex flex-col items-center gap-4">
          {state.phase === "flash" ? (
            <ExpectedTiles item={current} />
          ) : (
            <>
              <span
                aria-hidden="true"
                className="grid size-20 place-items-center rounded-full border-[3px] border-ink bg-honey shadow-pop"
              >
                <EyeClosedIcon size={40} weight="bold" />
              </span>
              <motion.div
                key={shake.sequence}
                data-typing-buffer="true"
                {...shake.shakeProps(reducedMotion)}
              >
                <BufferTiles item={current} progress={state.progress} />
              </motion.div>
            </>
          )}
        </div>
      )}

      <p aria-live="polite" className="min-h-7 text-center font-display text-lg text-ink">
        {announcement}
      </p>

      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="flex flex-wrap items-center justify-center gap-1.5">
          {sequences.map((_, i) => (
            <StarShape key={i} size={40} filled={i < state.index} emptyClassName="text-ink-soft" />
          ))}
        </span>
        <ProgressHint>
          {Math.min(state.index + 1, sequences.length)} of {sequences.length}
        </ProgressHint>
      </div>
    </div>
  );
}
