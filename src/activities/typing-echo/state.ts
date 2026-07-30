import type { TypingCharIntent } from "../_shared/typing/typingKey";
import {
  initialWordProgress,
  isWordComplete,
  pressWordBackspace,
  pressWordKey,
  wordItemResult,
  type WordProgress,
} from "../_shared/typing/wordType";
import type { TypingEchoResponse } from "./logic";

/**
 * Star Echo's flash/recall round as a pure, CLOCK-INJECTED reducer — every
 * timing and typing case is unit-testable without a DOM or a fake timer. All
 * buffer/retry/missedExpected logic is delegated to `wordType.ts`; this file
 * only owns the phase clock and the sequence-to-sequence handoff.
 */
export type EchoPhase = "flash" | "recall";

export interface EchoState {
  index: number;
  phase: EchoPhase;
  phaseStartedMs: number;
  progress: WordProgress;
  results: TypingEchoResponse["sequences"];
}

export function initialEchoState(nowMs: number): EchoState {
  return {
    index: 0,
    phase: "flash",
    phaseStartedMs: nowMs,
    progress: initialWordProgress(),
    results: [],
  };
}

/** Only ever moves flash → recall; a tick during recall is a no-op. */
export function tickEcho(state: EchoState, flashMs: number, nowMs: number): EchoState {
  if (state.phase !== "flash") return state;
  if (nowMs - state.phaseStartedMs < flashMs) return state;
  return { ...state, phase: "recall", phaseStartedMs: nowMs };
}

/**
 * The sequence is on screen during flash, so typing then would defeat the
 * exercise — and scoring it would punish a child for reading ahead. Ignore it
 * outright rather than routing it through the engine.
 */
export function pressEchoKey(
  state: EchoState,
  sequences: readonly string[],
  intent: Pick<TypingCharIntent, "char" | "shiftKey">,
  nowMs: number,
): EchoState {
  if (state.phase !== "recall") return state;
  const expected = sequences[state.index];
  if (expected === undefined) return state;

  const progress = pressWordKey(state.progress, expected, intent, nowMs);
  if (!isWordComplete(progress)) return { ...state, progress };

  return {
    index: state.index + 1,
    phase: "flash",
    phaseStartedMs: nowMs,
    progress: initialWordProgress(),
    results: [...state.results, wordItemResult(progress, state.index)],
  };
}

export function pressEchoBackspace(state: EchoState): EchoState {
  if (state.phase !== "recall") return state;
  const progress = pressWordBackspace(state.progress);
  if (progress === state.progress) return state;
  return { ...state, progress };
}

export function isEchoComplete(state: EchoState, total: number): boolean {
  return state.index >= total;
}
