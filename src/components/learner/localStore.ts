"use client";

/**
 * A tiny localStorage-backed store for `useSyncExternalStore`. This is the
 * clean client persistence seam for the learner surface (progress, active
 * learner): an SSR-safe server snapshot plus a subscribe/getSnapshot pair, so
 * components hydrate without setState-in-effect cascades.
 *
 * Snapshots are cached per key and only replaced when the stored string
 * actually changes, so `getSnapshot` returns a stable reference between reads
 * (required by useSyncExternalStore to avoid render loops).
 *
 * TODO: a server-backed store (DB attempt/skill_state) can implement the same
 * subscribe/getSnapshot contract in a later phase without touching callers.
 */

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
/** Cache of the last parsed snapshot, keyed by storage key, with the raw
 *  string it was parsed from (for change detection). */
const cache = new Map<string, { raw: string | null; value: unknown }>();

function rawFor(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function notify(key: string): void {
  const set = listeners.get(key);
  if (set) for (const fn of set) fn();
}

/** Subscribe to changes for a key (cross-tab via `storage`, same-tab via writes). */
export function subscribeKey(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) notify(key);
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return () => {
    set?.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/**
 * Stable snapshot for a key, parsed by `parse`. Returns the same reference
 * until the underlying string changes. `parse` must be pure and is only called
 * when the raw value changes.
 */
export function getKeySnapshot<T>(key: string, parse: (raw: string | null) => T): T {
  const raw = rawFor(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

/** Write a value and notify same-tab subscribers (the `storage` event does not
 *  fire in the tab that performed the write). */
export function writeKey(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota/availability failures are non-fatal for a child's flow.
    return;
  }
  // Invalidate the cache eagerly so the next snapshot reflects the write.
  cache.delete(key);
  notify(key);
}
