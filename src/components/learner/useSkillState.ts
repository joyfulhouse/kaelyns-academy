"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SkillOutcome, SkillTag } from "@/content";
import { applyEvidence, type SkillState } from "@/lib/tutor";
import { getKeySnapshot, subscribeKey, writeKey } from "./localStore";

/**
 * The single source of mastery truth on the client.
 *
 * Persists the learner's per-skill evidence history (the tutor engine's
 * `SkillState`) to localStorage, keyed per learner + program, via the same
 * `useSyncExternalStore` seam as `useProgress`. No setState-in-effect: the SSR
 * snapshot is the empty state, then React swaps in the persisted state after
 * hydration. `record()` folds one activity's evidence in (immutably, through the
 * engine's `applyEvidence`) and notifies subscribers so every reader re-renders.
 *
 * TODO: back with a server-side skill_state table in a later phase — implement
 * the same subscribe/getSnapshot/record contract and keep this return shape.
 */

type SkillEvidence = { skill: SkillTag; outcome: SkillOutcome };

export interface UseSkillState {
  /** The learner's current mastery state (engine `SkillState`). */
  skillState: SkillState;
  /** Fold one activity's skill evidence in, stamped with `day` (defaults to today). */
  record: (evidence: SkillEvidence[], day?: string) => void;
  /** True once the persisted state has been read from storage (SSR-safe gate). */
  ready: boolean;
}

const STORAGE_PREFIX = "ka:skillstate";

function storageKey(learnerId: string, programSlug: string): string {
  return `${STORAGE_PREFIX}:${learnerId}:${programSlug}`;
}

/** Today as a calendar day key, e.g. "2026-06-13" (the mastery gate's unit). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Stable empty state for the SSR snapshot (a fresh object each render would
 *  defeat useSyncExternalStore's reference check). */
const EMPTY_STATE: SkillState = Object.freeze({}) as SkillState;

const OUTCOMES: readonly SkillOutcome[] = ["not_yet", "emerging", "solid"];

/** Parse a stored skill-state string into a validated `SkillState`. Pure: safe
 *  for the snapshot cache. Corrupt/empty storage yields the shared empty state. */
function parseState(raw: string | null): SkillState {
  if (!raw) return EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return EMPTY_STATE;
    const out: SkillState = {};
    for (const [skill, record] of Object.entries(parsed as Record<string, unknown>)) {
      if (record === null || typeof record !== "object") continue;
      const history = (record as { history?: unknown }).history;
      if (!Array.isArray(history)) continue;
      const clean: SkillState[string]["history"] = [];
      for (const entry of history) {
        if (entry === null || typeof entry !== "object") continue;
        const { day, outcome } = entry as { day?: unknown; outcome?: unknown };
        if (typeof day === "string" && typeof outcome === "string" && OUTCOMES.includes(outcome as SkillOutcome)) {
          clean.push({ day, outcome: outcome as SkillOutcome });
        }
      }
      if (clean.length > 0) out[skill] = { history: clean };
    }
    return out;
  } catch {
    // Corrupt storage is non-fatal: a child simply starts fresh.
    return EMPTY_STATE;
  }
}

export function useSkillState(learnerId: string, programSlug: string): UseSkillState {
  const key = storageKey(learnerId, programSlug);

  // External-store subscription: SSR + first client render see the empty state,
  // then React swaps in the persisted state after hydration. No setState-in-effect.
  const subscribe = useCallback((listener: () => void) => subscribeKey(key, listener), [key]);
  const skillState = useSyncExternalStore(
    subscribe,
    () => getKeySnapshot(key, parseState),
    () => EMPTY_STATE,
  );

  // True once we're past the server snapshot (client-hydrated).
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const record = useCallback<UseSkillState["record"]>(
    (evidence, day) => {
      if (evidence.length === 0) return;
      // Read the latest committed state (not the render-time snapshot) so rapid
      // successive records fold onto each other rather than racing.
      const current = getKeySnapshot(key, parseState);
      const next = applyEvidence(current, evidence, day ?? today());
      writeKey(key, JSON.stringify(next));
    },
    [key],
  );

  return { skillState, record, ready };
}
