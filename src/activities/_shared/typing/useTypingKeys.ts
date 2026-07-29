"use client";

import { useEffect, useEffectEvent } from "react";
import {
  classifyKeydown,
  preventsDefault,
  type KeydownLike,
  type KeyIntent,
} from "./typingKey";

const ACTIVATABLE_SELECTOR = "button, a, [role='button']";
const TEXT_ENTRY_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

type ClosestTarget = EventTarget & {
  closest: (selector: string) => Element | null;
};

function hasClosest(target: EventTarget | null): target is ClosestTarget {
  return target !== null && "closest" in target && typeof target.closest === "function";
}

function matchesClosest(target: EventTarget | null, selector: string): boolean {
  return hasClosest(target) && target.closest(selector) !== null;
}

function isKeyboardFocusedActivatable(target: EventTarget | null): boolean {
  if (!hasClosest(target)) return false;
  const control = target.closest(ACTIVATABLE_SELECTOR);
  return control !== null && control.matches(":focus-visible");
}

function isActivationKey(key: string): boolean {
  return key === " " || key === "Enter";
}

/**
 * Apply the focus policy, classify one keydown, and deliver any gameplay
 * intent. Text-entry controls own every key. Keyboard-focused buttons and links
 * own their native activation keys; pointer-focused controls do not trap Space.
 */
export function dispatchTypingKeydown(
  event: KeydownLike & {
    target: EventTarget | null;
    preventDefault: () => void;
  },
  emit: (intent: KeyIntent) => void,
): void {
  if (matchesClosest(event.target, TEXT_ENTRY_SELECTOR)) return;
  if (
    isActivationKey(event.key) &&
    isKeyboardFocusedActivatable(event.target)
  ) {
    return;
  }
  if (preventsDefault(event)) event.preventDefault();
  const intent = classifyKeydown(event);
  if (intent.type !== "ignore") emit(intent);
}

/**
 * Window-level keydown for a typing Player. Window-level (not an input element)
 * because the child must simply type — there is no field to focus, and no typed
 * text is ever collected.
 *
 * `useEffectEvent` keeps the listener subscribed across re-renders while always
 * calling the latest `onIntent`. A "latest ref" written during render would trip
 * `react-hooks/refs`; writing that ref in a passive effect would leave a window
 * where a keystroke reaches the previous render's closure.
 */
export function useTypingKeys(onIntent: (intent: KeyIntent) => void, active: boolean): void {
  const emit = useEffectEvent((intent: KeyIntent) => {
    onIntent(intent);
  });

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      dispatchTypingKeydown(event, emit);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}
