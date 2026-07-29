import { matchesTypingTarget, type TypingCharIntent } from "./typingKey";

/**
 * Pure, clock-injected word-typing engine shared by typing-write and
 * typing-race. §8: `typed` is client-only display state — a response is built
 * ONLY from `wordItemResult`, which carries expected-derived data (the missed
 * EXPECTED characters), never what the child actually pressed.
 */
interface TypedChar { char: string; ok: boolean }

export interface WordProgress {
  typed: TypedChar[];
  retries: number;
  missedExpected: string[];
  diverged: boolean;
  startedMs: number | null;
  completedMs: number | null;
}

/** A couple of stray keys past the end still render; more are ignored. */
export const BUFFER_SLACK = 2;

/**
 * Both response schemas cap per-item `ms` at this value. `ms` is
 * indicative-only (never scoring evidence), so an honestly slow completion —
 * a child who walks away mid-word with the tab still visible, then finishes —
 * must clamp here rather than fail the whole round's response validation.
 */
export const MAX_ITEM_MS = 600_000;
export const MAX_ITEM_RETRIES = 30;

export function initialWordProgress(): WordProgress {
  return { typed: [], retries: 0, missedExpected: [], diverged: false, startedMs: null, completedMs: null };
}

export function isWordComplete(state: WordProgress): boolean {
  return state.completedMs !== null;
}

/** Whether a character intent will add a visually wrong entry (or hit the cap). */
export function wordKeyWillBeWrong(
  state: WordProgress,
  expected: string,
  intent: Pick<TypingCharIntent, "char" | "shiftKey">,
): boolean {
  if (state.completedMs !== null) return false;
  const pos = state.typed.length;
  return state.diverged || pos >= expected.length || !matchesTypingTarget(expected[pos], intent);
}

export function pressWordKey(
  state: WordProgress,
  expected: string,
  intent: Pick<TypingCharIntent, "char" | "shiftKey">,
  nowMs: number,
): WordProgress {
  if (state.completedMs !== null) return state;
  const pos = state.typed.length;
  if (pos >= expected.length + BUFFER_SLACK) return state;

  const inWord = pos < expected.length;
  const ok = inWord && !state.diverged && matchesTypingTarget(expected[pos], intent);
  const typed = [...state.typed, { char: intent.char, ok }];

  // One miss per episode, recorded at the divergence point; typing past the
  // end has no expected character to record.
  const missedExpected =
    ok || state.diverged || !inWord || state.missedExpected.includes(expected[pos])
      ? state.missedExpected
      : [...state.missedExpected, expected[pos]];

  const diverged = state.diverged || !ok;
  const startedMs = state.startedMs ?? nowMs;
  const completed = !diverged && typed.length === expected.length;
  return {
    typed,
    retries: state.retries,
    missedExpected,
    diverged,
    startedMs,
    completedMs: completed ? nowMs : null,
  };
}

export function pressWordBackspace(state: WordProgress): WordProgress {
  if (state.completedMs !== null || state.typed.length === 0) return state;
  const typed = state.typed.slice(0, -1);
  const stillDiverged = typed.some((entry) => !entry.ok);
  return {
    ...state,
    typed,
    diverged: stillDiverged,
    retries:
      state.diverged && !stillDiverged
        ? Math.min(MAX_ITEM_RETRIES, state.retries + 1)
        : state.retries,
  };
}

export function wordItemResult(
  state: WordProgress,
  i: number,
): { i: number; ok: boolean; ms: number; retries: number; missedExpected: string[] } {
  const ms =
    state.completedMs !== null && state.startedMs !== null
      ? Math.min(MAX_ITEM_MS, Math.max(0, state.completedMs - state.startedMs))
      : 0;
  return {
    i,
    ok: state.completedMs !== null && state.retries === 0 && state.missedExpected.length === 0,
    ms,
    retries: state.retries,
    missedExpected: [...state.missedExpected],
  };
}
