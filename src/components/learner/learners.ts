"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getKeySnapshot, subscribeKey, writeKey } from "./localStore";

/**
 * Mock learner profiles for the pilot (no auth yet). Parent accounts → child
 * profiles land in P4; until then the studio home offers a friendly
 * pick-a-learner with a couple of avatars.
 *
 * TODO: replace with the parent's real child profiles (server) in P4; keep the
 * `Learner` shape + `useActiveLearner` seam stable.
 */

export interface Learner {
  id: string;
  name: string;
  /** A friendly avatar emoji (the child recognizes the face, not the name). */
  avatar: string;
}

export const LEARNERS: Learner[] = [
  { id: "kaelyn", name: "Kaelyn", avatar: "🦊" },
  { id: "robin", name: "Robin", avatar: "🐢" },
];

const DEFAULT_LEARNER_ID = LEARNERS[0].id;

const ACTIVE_LEARNER_KEY = "ka:active-learner";

export type LearnerPickerEvent = "mount" | "switch" | "pick";

/**
 * Resolve the account learner that is safe to auto-enter. A remembered learner
 * must still belong to the household; without one, only a single-learner
 * household is unambiguous. Returning null keeps multi-learner households at
 * the picker instead of silently choosing the first profile.
 */
export function resolveAccountLearnerId(
  rememberedId: string | null,
  learnerIds: readonly string[],
): string | null {
  if (rememberedId && learnerIds.includes(rememberedId)) return rememberedId;
  return learnerIds.length === 1 ? learnerIds[0] : null;
}

/**
 * Once account selection has been resolved, the picker is an explicit detour.
 * The visible switch action opens it, and choosing a learner closes it again.
 */
export function learnerPickerTransition(open: boolean, event: LearnerPickerEvent): boolean {
  switch (event) {
    case "mount":
    case "pick":
      return false;
    case "switch":
      return !open;
  }
}

function getLearner(id: string): Learner | undefined {
  return LEARNERS.find((l) => l.id === id);
}

/** Coerce a stored value to a known learner id (or the default). Pure: safe
 *  for the snapshot cache. */
function parseLearnerId(raw: string | null): string {
  return raw && LEARNERS.some((l) => l.id === raw) ? raw : DEFAULT_LEARNER_ID;
}

/** The active learner id, persisted so the choice carries across pages. */
export function useActiveLearner(): {
  learnerId: string;
  learner: Learner;
  setLearnerId: (id: string) => void;
  ready: boolean;
} {
  // SSR + first client render resolve to the default; the persisted choice
  // swaps in after hydration via the external store (no setState-in-effect).
  const subscribe = useCallback(
    (listener: () => void) => subscribeKey(ACTIVE_LEARNER_KEY, listener),
    [],
  );
  const learnerId = useSyncExternalStore(
    subscribe,
    () => getKeySnapshot(ACTIVE_LEARNER_KEY, parseLearnerId),
    () => DEFAULT_LEARNER_ID,
  );
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const setLearnerId = useCallback((id: string) => {
    if (!LEARNERS.some((l) => l.id === id)) return;
    writeKey(ACTIVE_LEARNER_KEY, id);
  }, []);

  const learner = getLearner(learnerId) ?? LEARNERS[0];
  return { learnerId, learner, setLearnerId, ready };
}
