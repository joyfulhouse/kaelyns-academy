"use client";

import { useEffect, useState } from "react";

export interface ManagedTimeout {
  /** Schedule `callback` after `ms`, replacing any still-pending timer. */
  set: (callback: () => void, ms: number) => void;
  /** Cancel a pending timer, if any. Safe to call when nothing is pending. */
  clear: () => void;
}

/**
 * Framework-free core of {@link useManagedTimeout}: a single-slot timeout that
 * clears the prior pending timer on each `set` and on `clear`. Exposed so the
 * timer logic can be unit-tested without a React renderer; components use the
 * hook.
 */
export function createManagedTimeout(): ManagedTimeout {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const clear = (): void => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };
  const set = (callback: () => void, ms: number): void => {
    clear();
    handle = setTimeout(() => {
      handle = null;
      callback();
    }, ms);
  };
  return { set, clear };
}

/**
 * A timeout whose pending timer is cleared automatically on unmount, so a
 * deferred state update — a wrong-answer shake reset, a reveal→advance step —
 * can never fire after the Player has navigated away. `set` replaces any prior
 * pending timer, matching the clear-then-schedule the Players used to do by hand.
 */
export function useManagedTimeout(): ManagedTimeout {
  const [timer] = useState(createManagedTimeout);
  useEffect(() => timer.clear, [timer]);
  return timer;
}
