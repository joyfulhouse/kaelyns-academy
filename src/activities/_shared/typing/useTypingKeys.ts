"use client";

import { useEffect, useEffectEvent } from "react";
import { classifyKeydown, preventsDefault, type KeyIntent } from "./typingKey";

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
      if (preventsDefault(event)) event.preventDefault();
      const intent = classifyKeydown(event);
      if (intent.type !== "ignore") emit(intent);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}
