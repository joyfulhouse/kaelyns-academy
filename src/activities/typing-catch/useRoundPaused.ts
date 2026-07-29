"use client";

import { useSyncExternalStore } from "react";
import { roundIsPaused } from "./state";

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

/** Hydration-safe visibility/focus state for the timed Star Catch round. */
export function useRoundPaused(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
