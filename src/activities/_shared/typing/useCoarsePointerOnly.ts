"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(any-pointer: fine)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return !window.matchMedia(QUERY).matches;
}

/**
 * True when the device reports NO fine pointer — a phone or tablet with no
 * mouse or trackpad, which almost always means no keyboard either. Mirrors
 * `useReducedMotion`'s `useSyncExternalStore` shape. SSR-safe: the server
 * snapshot is `null`, so consumers can distinguish the hydration frame from a
 * resolved fine-pointer result and avoid narrating the wrong gate.
 */
export function useCoarsePointerOnly(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, () => null);
}
