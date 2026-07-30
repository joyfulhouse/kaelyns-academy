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
import { shouldRunOneShotEffect, useReadAloudEnabled, useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { PauseOverlay } from "../_shared/typing/PauseOverlay";
import { TypingStage } from "../_shared/typing/TypingStage";
import { isCapitalKey } from "../_shared/typing/keys";
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

/**
 * When the instruction utterance can't actually be delivered (unsupported
 * engine, no voice, cancelled), the first flash still shouldn't pop open the
 * instant the round mounts — the child has no cue at all yet. A short,
 * finite beat stands in for the utterance rather than waiting forever on
 * speech that will never arrive (ITEM 1).
 */
export const INSTRUCTION_SETTLE_FALLBACK_MS = 900;

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

/**
 * Screen readers don't convey case by default, but `matchesTypingTarget`
 * requires Shift for a capital — so case has to be spelled out in words for
 * both the spoken and the announced form (ITEM 4), not left to the
 * `aria-hidden` tiles that a screen-reader user never sees.
 */
function announceSequence(sequence: string): string {
  return sequence
    .split("")
    .map((ch) => (isCapitalKey(ch) ? `capital ${ch}` : ch))
    .join(", then ");
}

function watchAnnouncement(sequence: string): string {
  return `Watch: ${announceSequence(sequence)}`;
}

export function EchoRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingEchoConfig, TypingEchoResponse>) {
  const parsed = useActivity(schema, config);
  const sequences = parsed.sequences;
  const speech = useSpeech();
  const readAloudEnabled = useReadAloudEnabled();
  const reducedMotion = useReducedMotion();
  const shake = useWrongShake();
  const paused = useRoundPaused();
  const [state, setState] = useState<EchoState>(() => initialEchoState(0));
  // Lazy initial value (not an effect-driven setState — react-hooks forbids
  // calling setState synchronously inside an effect body): when nothing will
  // actually be spoken, there is nothing to wait for, so the round starts
  // already settled.
  const [instructionSettled, setInstructionSettled] = useState(
    () => !shouldRunOneShotEffect(readAloudEnabled, false),
  );
  const instructionStarted = useRef(false);
  const reported = useRef(false);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  const finished = isEchoComplete(state, sequences.length);
  const current = finished ? null : (sequences[state.index] ?? null);

  // ITEM 1: a pre-reader's eyes are on the keyboard, not the screen, while
  // she's being told what to do — audio is PRODUCT.md §1's PRIMARY channel.
  // The very first flash must not open (and its letters must not vanish)
  // while that instruction is still being spoken. Once settled, this stays
  // true for the rest of the round — every later flash and reflash is free
  // to open immediately, since by then the child has already heard it once.
  useEffect(() => {
    if (instructionStarted.current) return;
    instructionStarted.current = true;
    // Nothing will be spoken (see the lazy initializer above) — already settled.
    if (!shouldRunOneShotEffect(readAloudEnabled, false)) return;
    let active = true;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    void speech.speak(parsed.instruction).then((outcome) => {
      if (!active) return;
      if (outcome !== "unavailable") {
        setInstructionSettled(true);
        return;
      }
      // Nothing is actually playing (unsupported engine, no voice) — a real
      // wait would never end, so stand in with a short, finite beat instead.
      fallback = setTimeout(() => {
        if (active) setInstructionSettled(true);
      }, INSTRUCTION_SETTLE_FALLBACK_MS);
    });
    return () => {
      active = false;
      if (fallback !== null) clearTimeout(fallback);
    };
  }, [readAloudEnabled, speech, parsed.instruction]);

  // ITEM 4: the sequence IS the puzzle content, so it's spoken via essential
  // content audio (plays even with read-aloud off) — the only reliable
  // channel for a blind child, independent of the live region's DOM-timing
  // race. Keyed on index+phaseStartedMs so a reflash (a fresh flash of the
  // SAME sequence) speaks again, not just the first presentation. Gated on
  // `instructionSettled` so it can never talk over the instruction, and on
  // `phase === "flash"` so recall — the §8 leak boundary — never speaks it.
  const sequenceAnnouncement =
    current !== null && state.phase === "flash" && instructionSettled
      ? announceSequence(current)
      : null;
  useSpeakOnce(speech.speak, sequenceAnnouncement, `${state.index}:${state.phaseStartedMs}`, {
    essentialContentAudio: true,
  });

  // Opens a wall-clock segment for exactly as long as the round is truly
  // live; its cleanup folds the segment's duration into accumulatedRef the
  // instant the round pauses, finishes, or unmounts, so a blurred tab never
  // shortens (or lengthens) the flash a child actually sees.
  useEffect(() => {
    if (paused || finished || !instructionSettled) {
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
  }, [paused, finished, parsed.flashMs, instructionSettled]);

  // The listener detaches the instant the round completes or pauses (Key
  // Camp's pattern, ITEM 9: matches typing-race/typing-catch's
  // `!finished && !paused` — a future pause path that keeps focus must not
  // accept recall keystrokes under the overlay). pressEchoKey's
  // `expected === undefined` branch is otherwise unreachable, since there is
  // no way to type past the final sequence.
  useTypingKeys((intent) => {
    const now = Math.round(
      currentElapsedMs(accumulatedRef.current, segmentStartRef.current, performance.now()),
    );
    if (intent.type === "backspace") {
      setState((prev) => pressEchoBackspace(prev, now));
      return;
    }
    if (intent.type !== "char") return;
    if (state.phase === "recall" && current !== null && wordKeyWillBeWrong(state.progress, current, intent)) {
      shake.trigger();
    }
    setState((prev) => pressEchoKey(prev, sequences, intent, now));
  }, !finished && !paused);

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
