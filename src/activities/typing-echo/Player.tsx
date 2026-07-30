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
import { shouldRunOneShotEffect, useReadAloudEnabled } from "../_shared/useSpeakOnce";
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

/**
 * `speech.speak()`'s contract promises to settle "only after delivery ends,
 * fails, or is explicitly superseded" — but a headless/voiceless browser
 * speech engine can leave an utterance queued forever, firing neither `onend`
 * nor `onerror` (a real, observed headless-Chromium quirk, not a hypothetical
 * one). `INSTRUCTION_SETTLE_FALLBACK_MS` only covers a promise that DOES
 * resolve, just unfavorably — this is the independent backstop for one that
 * never resolves at all. Audio is an enhancement, never required: this must
 * win eventually regardless of what the speech engine does.
 */
export const INSTRUCTION_HARD_CEILING_MS = 4_000;

/**
 * Judgment call (ITEM 4 follow-up): truncating mid-utterance is the right
 * call for a SIGHTED child — she still has the tiles. It is the WRONG call
 * for a blind child, for whom this utterance is the only channel that ever
 * conveys the sequence at all (the tiles are `aria-hidden`). Accepting
 * truncation would mean this activity's stated accessibility guarantee is
 * false whenever a sequence's spoken form runs longer than its authored
 * `flashMs` — which is real: "capital F, then j" already approaches
 * `big-echo-caps`'s 1400ms budget. So `flashMs` does NOT get to silently
 * truncate this; recall begins at max(flashMs elapsed, this episode's
 * speech settled) — see the tick effect below. This ceiling is the bound on
 * that wait, so a hung speech engine (same failure mode as
 * INSTRUCTION_HARD_CEILING_MS) can't strand the round a second way.
 */
const SEQUENCE_SPEECH_HARD_CEILING_MS = 3_000;

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

/**
 * Whether a flash -> recall transition `tickEcho` just computed should be
 * held back one more tick because this episode's essential-content speech
 * hasn't settled yet — the judgment call documented at
 * `SEQUENCE_SPEECH_HARD_CEILING_MS`: a fixed `flashMs` must not silently
 * truncate a blind child's only channel for the sequence. Exported as a
 * pure function (rather than inlined in the interval callback) so it's
 * directly unit-testable — the real interval is a no-op in this suite's
 * window-less test environment, the same reason `tickEcho` itself lives in
 * `state.ts` as a pure, clock-injected function.
 */
export function holdForSequenceSpeech(
  prevPhase: EchoState["phase"],
  nextPhase: EchoState["phase"],
  speechSettled: boolean,
): boolean {
  return prevPhase === "flash" && nextPhase === "recall" && !speechSettled;
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
    const settle = (): void => {
      if (active) setInstructionSettled(true);
    };
    // Independent backstop, started alongside the speak() call rather than
    // chained off its outcome: covers a promise that never settles at all
    // (see INSTRUCTION_HARD_CEILING_MS), not just one that settles
    // unfavorably. `settle` is idempotent, so racing this against the
    // outcome-driven paths below is safe — whichever fires first wins.
    const hardCeiling = setTimeout(settle, INSTRUCTION_HARD_CEILING_MS);
    void speech.speak(parsed.instruction).then((outcome) => {
      if (!active) return;
      clearTimeout(hardCeiling);
      if (outcome !== "unavailable") {
        settle();
        return;
      }
      // Nothing is actually playing (unsupported engine, no voice) — a real
      // wait would never end, so stand in with a short, finite beat instead.
      fallback = setTimeout(settle, INSTRUCTION_SETTLE_FALLBACK_MS);
    });
    return () => {
      active = false;
      clearTimeout(hardCeiling);
      if (fallback !== null) clearTimeout(fallback);
    };
  }, [readAloudEnabled, speech, parsed.instruction]);

  // ITEM 4: the sequence IS the puzzle content — for a blind child it's the
  // ONLY channel that ever conveys it (the tiles are `aria-hidden`), so it's
  // spoken unconditionally (essential content plays regardless of the
  // read-aloud toggle — no gating needed, unlike the instruction above).
  // Keyed on index+phaseStartedMs so a reflash (a fresh flash of the SAME
  // sequence) speaks again, not just the first presentation. Gated on
  // `instructionSettled` so it can never talk over the instruction, and on
  // `phase === "flash"` so recall — the §8 leak boundary — never speaks it.
  const sequenceKey =
    current !== null && state.phase === "flash" && instructionSettled
      ? `${state.index}:${state.phaseStartedMs}`
      : null;
  const sequenceAnnouncement = sequenceKey !== null ? announceSequence(current!) : null;
  // Spoken directly rather than via `useSpeakOnce`: the tick effect below
  // needs the SETTLE signal (not just the fire) to hold flash -> recall at
  // max(flashMs elapsed, this episode's speech settled) — see
  // SEQUENCE_SPEECH_HARD_CEILING_MS's doc comment for why a fixed `flashMs`
  // is not allowed to silently truncate a blind child's only channel.
  const sequenceSpeechSettledRef = useRef(true);
  const sequenceSpokenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (sequenceKey === null || sequenceAnnouncement === null) return;
    if (sequenceSpokenKeyRef.current === sequenceKey) return;
    sequenceSpokenKeyRef.current = sequenceKey;
    sequenceSpeechSettledRef.current = false;
    let active = true;
    const settle = (): void => {
      if (active) sequenceSpeechSettledRef.current = true;
    };
    const hardCeiling = setTimeout(settle, SEQUENCE_SPEECH_HARD_CEILING_MS);
    void speech.speak(sequenceAnnouncement).then(() => {
      if (!active) return;
      clearTimeout(hardCeiling);
      settle();
    });
    return () => {
      active = false;
      clearTimeout(hardCeiling);
    };
  }, [sequenceKey, sequenceAnnouncement, speech]);

  // `useSpeakOnce`-style dedup only guards against STARTING a new utterance
  // during recall — it does nothing about one already in flight. A slow or
  // queued flash utterance (or one that legitimately outran flashMs and hit
  // SEQUENCE_SPEECH_HARD_CEILING_MS above) would otherwise keep speaking the
  // hidden answer into recall, after the tiles are gone. Cancel it explicitly
  // at the flash→recall transition itself (the same move `PauseOverlay`
  // makes on its own resume), not in a cleanup that only fires on unmount.
  // `state.phase` alone is a sufficient dependency: every entry into recall
  // is necessarily preceded by a commit where phase was "flash" (the initial
  // flash or a reflash), so this fires again on a reflash's own exit too.
  useEffect(() => {
    if (state.phase !== "recall") return;
    speech.cancel();
  }, [state.phase, speech]);

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
      setState((prev) => {
        const next = tickEcho(prev, parsed.flashMs, now);
        // The next tick (100ms later) re-checks and applies the transition
        // the moment the speech settles (or its own ceiling forces it to).
        if (holdForSequenceSpeech(prev.phase, next.phase, sequenceSpeechSettledRef.current)) {
          return prev;
        }
        return next;
      });
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
