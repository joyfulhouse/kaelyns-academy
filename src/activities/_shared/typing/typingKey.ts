/**
 * Keydown hardening for the typing games, as a PURE function over a plain
 * object — so every case is unit-testable in the node test environment with no
 * DOM. `KeyboardEvent` is structurally assignable to `KeydownLike`.
 *
 * The rules exist because a child's hands find every one of these: a held key,
 * a stray Cmd, CapsLock, the space bar scrolling the page out from under the
 * game. None of them may ever score as a miss.
 */

export interface KeydownLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
}

export type KeyIntent =
  | { type: "ignore" }
  | { type: "char"; char: string; code: string; shiftKey: boolean }
  | { type: "backspace" };
export type TypingCharIntent = Extract<KeyIntent, { type: "char" }>;

const IGNORE: KeyIntent = { type: "ignore" };

/** Keys the browser would otherwise act on mid-game. */
const SWALLOWED = new Set([" ", "'", "/"]);

export function classifyKeydown(event: KeydownLike): KeyIntent {
  if (event.ctrlKey || event.metaKey || event.altKey) return IGNORE;
  if (event.repeat) return IGNORE;
  if (event.isComposing === true) return IGNORE;
  if (event.key === "Dead" || event.key === "Process") return IGNORE;
  if (event.key === "Backspace") return { type: "backspace" };
  // Every printable key reports a single-character `key`; named keys
  // ("Shift", "ArrowLeft", "F3") are longer and are not typing.
  if (event.key.length === 1) {
    return {
      type: "char",
      char: event.key,
      code: event.code,
      shiftKey: event.shiftKey,
    };
  }
  return IGNORE;
}

export function preventsDefault(event: KeydownLike): boolean {
  const intent = classifyKeydown(event);
  if (intent.type === "backspace") return true;
  return intent.type === "char" && SWALLOWED.has(intent.char);
}

/**
 * Case-forgiving when the target is lowercase (a stray CapsLock is not a
 * mistake worth failing a child over), exact when the target is a capital —
 * with Shift held, because then reaching for Shift IS the skill. This slice
 * deliberately does not distinguish left/right Shift: doing that reliably
 * requires tracking a separate modifier keydown by code/location.
 */
export function matchesTypingTarget(
  expected: string,
  intent: Pick<TypingCharIntent, "char" | "shiftKey">,
): boolean {
  if (expected === expected.toLowerCase()) {
    return intent.char.toLowerCase() === expected;
  }
  return intent.char === expected && intent.shiftKey;
}
