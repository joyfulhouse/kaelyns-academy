"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("blur", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("blur", onChange);
    window.removeEventListener("focus", onChange);
  };
}

function getSnapshot(): boolean {
  if (typeof document === "undefined") return false;
  return roundIsPaused(document.hidden, document.hasFocus());
}

/** Hydration-safe visibility/focus state for a timed typing round (Star
 *  Catch, Rocket Race). */
export function useRoundPaused(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function subscribeHidden(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getHiddenSnapshot(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/** Hydration-safe document visibility. A hidden tab has no listener to talk
 *  to, so speech keyed to the pause overlay must stay silent there. */
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(subscribeHidden, getHiddenSnapshot, () => false);
}

/** Both visibility and focus must agree that the child can see the round. */
export function roundIsPaused(documentHidden: boolean, windowFocused: boolean): boolean {
  return documentHidden || !windowFocused;
}
