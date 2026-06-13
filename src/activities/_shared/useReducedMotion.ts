"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * Tracks `prefers-reduced-motion: reduce` via `useSyncExternalStore` (the
 * React-blessed way to subscribe to an external store; no setState-in-effect).
 * SSR-safe: the server snapshot is `false`, resolving on the client. Players
 * use this to drop the star-pop / sparkle to instant opacity (DESIGN.md §4).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
