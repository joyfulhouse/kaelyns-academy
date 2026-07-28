"use client";

import { useEffect, useRef } from "react";
import { classifyKeydown, preventsDefault, type KeyIntent } from "./typingKey";

/**
 * Window-level keydown for a typing Player. Window-level (not an input element)
 * because the child must simply type — there is no field to focus, and no typed
 * text is ever collected. The callback rides a ref so a changing handler does
 * not detach and reattach the listener between keystrokes.
 */
export function useTypingKeys(onIntent: (intent: KeyIntent) => void, active: boolean): void {
  const handler = useRef(onIntent);

  useEffect(() => {
    handler.current = onIntent;
  }, [onIntent]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (preventsDefault(event)) event.preventDefault();
      const intent = classifyKeydown(event);
      if (intent.type !== "ignore") handler.current(intent);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}
