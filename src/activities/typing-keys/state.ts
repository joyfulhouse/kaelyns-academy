import type { TypingKeysResponse } from "./logic";
import {
  matchesTypingTarget,
  type TypingCharIntent,
} from "../_shared/typing/typingKey";

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

export function pressKey(
  state: KeysState,
  expected: string,
  intent: TypingCharIntent,
): KeysState {
  if (!matchesTypingTarget(expected, intent)) {
    return { ...state, retries: Math.min(MAX_RETRIES, state.retries + 1) };
  }
  return {
    index: state.index + 1,
    retries: 0,
    done: [...state.done, { key: expected, ok: true, retries: state.retries }],
  };
}

/**
 * Resolve the expected prompt from the state being transitioned, not from a
 * render-time target. React may batch two keydowns before painting either one;
 * each updater must therefore advance from the result of the previous updater.
 */
export function pressNextKey(
  state: KeysState,
  prompts: readonly string[],
  intent: TypingCharIntent,
): KeysState {
  const expected = prompts[state.index];
  return expected === undefined ? state : pressKey(state, expected, intent);
}

export function isKeysComplete(state: KeysState, total: number): boolean {
  return state.index >= total;
}
