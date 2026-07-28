import type { TypingKeysResponse } from "./logic";

/**
 * Key Camp's rules as a pure reducer, so every case is testable in the node
 * test environment. The Player owns painting and focus; it owns nothing else.
 */
export interface KeysState {
  index: number;
  retries: number;
  done: TypingKeysResponse["prompts"];
}

/** Matches the response schema's ceiling — a mashed keyboard must not overflow it. */
const MAX_RETRIES = 20;

export function initialKeysState(): KeysState {
  return { index: 0, retries: 0, done: [] };
}

/**
 * Case-forgiving when the target is lowercase (a stray CapsLock is not a
 * mistake worth failing a child over), exact when the target is a capital —
 * because then reaching for shift IS the skill.
 */
function matches(expected: string, char: string): boolean {
  if (expected === expected.toLowerCase()) return char.toLowerCase() === expected;
  return char === expected;
}

export function pressKey(state: KeysState, expected: string, char: string): KeysState {
  if (!matches(expected, char)) {
    return { ...state, retries: Math.min(MAX_RETRIES, state.retries + 1) };
  }
  return {
    index: state.index + 1,
    retries: 0,
    done: [...state.done, { key: expected, ok: true, retries: state.retries }],
  };
}

export function isKeysComplete(state: KeysState, total: number): boolean {
  return state.index >= total;
}
