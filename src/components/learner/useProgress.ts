"use client";

import { useCallback, useSyncExternalStore } from "react";
import { listPrograms } from "@/content";
import type { Program, Unit } from "@/content";
import { getKeySnapshot, subscribeKey, writeKey } from "./localStore";

/**
 * Learner progress (client-side).
 *
 * Persists completed activities + earned stars to localStorage, keyed per
 * learner + program. This is the *clean DB seam*: the shape mirrors what a
 * server-backed attempt/skill_state table will return, so swapping the storage
 * implementation later does not change callers.
 *
 * TODO: back with DB attempt/skill_state (server) in a later phase — replace the
 * localStorage read/write with a fetch to a per-learner progress endpoint and
 * keep this hook's return shape identical.
 */

type StarCount = 0 | 1 | 2 | 3;

/** activityId -> best stars earned. Absent key = not yet completed. */
export type ProgressMap = Record<string, StarCount>;

export interface UnitProgress {
  /** activities in the unit that have at least one star recorded */
  completed: number;
  /** total activities in the unit */
  total: number;
  /** 0..1 share of activities completed (0 when the unit has no activities) */
  ratio: number;
  /** sum of best stars earned across the unit */
  stars: number;
  /** max stars achievable in the unit (3 per activity) */
  maxStars: number;
  /** true once every activity in the unit has been completed */
  done: boolean;
}

export interface UseProgress {
  /** Best stars earned for an activity (0 if never completed). */
  getStars: (activityId: string) => StarCount;
  /** True if the activity has been completed at least once. */
  isComplete: (activityId: string) => boolean;
  /** Record a completion. Keeps the *best* star result, never lowers it. */
  complete: (activityId: string, stars: number) => void;
  /** Roll-up progress for a single unit. */
  unitProgress: (unitId: string) => UnitProgress;
  /** True once the persisted map has been read from storage (SSR-safe gate). */
  ready: boolean;
}

const STORAGE_PREFIX = "ka:progress";

function storageKey(learnerId: string, programSlug: string): string {
  return `${STORAGE_PREFIX}:${learnerId}:${programSlug}`;
}

function clampStars(value: number): StarCount {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 3) return 3;
  return rounded as StarCount;
}

/** Stable empty map for the SSR snapshot (a fresh object every render would
 *  defeat useSyncExternalStore's reference check). */
const EMPTY_MAP: ProgressMap = Object.freeze({});

/** Parse a stored progress string into a validated map. Pure: safe for the
 *  snapshot cache. Corrupt/empty storage yields the shared empty map. */
function parseMap(raw: string | null): ProgressMap {
  if (!raw) return EMPTY_MAP;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return EMPTY_MAP;
    const out: ProgressMap = {};
    for (const [id, stars] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof stars === "number") out[id] = clampStars(stars);
    }
    return out;
  } catch {
    // Corrupt storage is non-fatal: a child simply starts fresh.
    return EMPTY_MAP;
  }
}

/** Build a unit roll-up from a progress map (pure; shared by hook + map view). */
export function computeUnitProgress(unit: Unit, map: ProgressMap): UnitProgress {
  let total = 0;
  let completed = 0;
  let stars = 0;
  for (const lesson of unit.lessons) {
    for (const activity of lesson.activities) {
      total += 1;
      const earned = map[activity.id] ?? 0;
      if (earned > 0 || activity.id in map) completed += 1;
      stars += earned;
    }
  }
  const maxStars = total * 3;
  return {
    completed,
    total,
    ratio: total === 0 ? 0 : completed / total,
    stars,
    maxStars,
    done: total > 0 && completed === total,
  };
}

/** Overall program completion ratio (pure; for the studio-home progress bar). */
export function computeProgramRatio(program: Program, map: ProgressMap): number {
  let total = 0;
  let completed = 0;
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        total += 1;
        if ((map[activity.id] ?? 0) > 0 || activity.id in map) completed += 1;
      }
    }
  }
  return total === 0 ? 0 : completed / total;
}

export function useProgress(learnerId: string, programSlug: string): UseProgress {
  const key = storageKey(learnerId, programSlug);

  // External-store subscription: SSR + first client render see the empty map,
  // then React swaps in the persisted map after hydration. No setState-in-effect.
  const subscribe = useCallback((listener: () => void) => subscribeKey(key, listener), [key]);
  const map = useSyncExternalStore(
    subscribe,
    () => getKeySnapshot(key, parseMap),
    () => EMPTY_MAP,
  );

  // True once we're past the server snapshot (client-hydrated).
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const getStars = useCallback<UseProgress["getStars"]>(
    (activityId) => clampStars(map[activityId] ?? 0),
    [map],
  );

  const isComplete = useCallback<UseProgress["isComplete"]>(
    (activityId) => activityId in map,
    [map],
  );

  const complete = useCallback<UseProgress["complete"]>(
    (activityId, stars) => {
      const next = clampStars(stars);
      const current = getKeySnapshot(key, parseMap);
      const best = current[activityId] ?? 0;
      // Forgiving by construction: keep the child's best result, never lower it.
      if (activityId in current && best >= next) return;
      writeKey(key, JSON.stringify({ ...current, [activityId]: next }));
    },
    [key],
  );

  const unitProgressFor = useCallback<UseProgress["unitProgress"]>(
    (unitId) => {
      const program = PROGRAM_LOOKUP.get(programSlug);
      const unit = program?.units.find((u) => u.id === unitId);
      if (!unit) {
        return { completed: 0, total: 0, ratio: 0, stars: 0, maxStars: 0, done: false };
      }
      return computeUnitProgress(unit, map);
    },
    [map, programSlug],
  );

  return { getStars, isComplete, complete, unitProgress: unitProgressFor, ready };
}

/* The hook resolves a unit's shape from just a unitId via the content registry,
 * so callers pass an id rather than the Unit. Content is static data (no service
 * connections), so this module-level lookup is build-safe. */
const PROGRAM_LOOKUP = new Map<string, Program>(
  listPrograms().map((p) => [p.slug, p]),
);
