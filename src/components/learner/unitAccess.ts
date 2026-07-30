/**
 * Which units a learner may open — one derivation, shared by every surface.
 *
 * Two independent rules compose here:
 *
 *  1. **Curation** (`activeUnitKeys`) — the parent's explicit assignment. This is
 *     access control: it is enforced again server-side on the write path
 *     (`isEnrollmentUnitActive` in `recordAttemptAction`).
 *  2. **Sequencing** (`computeUnlockedIds`) — the forgiving world-map pacing. This
 *     is NOT access control. It is deliberately not enforced on the write path:
 *     a child who reaches a finished activity by any route must keep the work.
 *     See `docs/claude/KNOWN-RISKS-P0-PILOT.md`.
 *
 * Both the world map and the activity route resolve through {@link playableUnitIds}
 * so the map can never show a unit as open that the route then blocks, or offer a
 * destination (hero pick, warm-up, quest) that the route refuses.
 */

import { computeUnlockedIds } from "./branching";

interface CuratableUnit {
  id: string;
  branchKey?: string;
}

interface CompletableUnit extends CuratableUnit {
  /** The unit's check-in phase ("baseline" | "mid" | "final"), matched
   *  structurally so this module stays independent of the content types. */
  readonly checkpoint?: string;
  readonly lessons: readonly {
    readonly activities: readonly { readonly id: string }[];
  }[];
}

/**
 * The units the parent has curated into view. An absent or empty `activeUnitKeys`
 * means "everything" — the same convention `isEnrollmentUnitActive` uses
 * server-side, so an empty list can never silently hide the whole program.
 */
export function curatedUnits<T extends CuratableUnit>(
  units: readonly T[],
  activeUnitKeys: ReadonlySet<string> | null,
): T[] {
  return activeUnitKeys ? units.filter((unit) => activeUnitKeys.has(unit.id)) : [...units];
}

/**
 * A unit is "started" once ANY activity in it has been completed — the forgiving
 * posture the map has always used. Key presence counts, so a 0-star finish still
 * opens what comes next.
 */
export function startedUnitIds<T extends CompletableUnit>(
  units: readonly T[],
  completedActivityIds: ReadonlySet<string>,
): Set<string> {
  const started = new Set<string>();
  for (const unit of units) {
    const touched = unit.lessons.some((lesson) =>
      lesson.activities.some((activity) => completedActivityIds.has(activity.id)),
    );
    if (touched) started.add(unit.id);
  }
  return started;
}

/**
 * The unit ids a learner may actually open: curated in, and unlocked by the
 * learner's own progress. Sequencing runs over the CURATED list, so a parent who
 * assigns only unit 7 gets unit 7 open (it is the first visible segment) rather
 * than a learner locked out of their own assignment.
 *
 * **Checkpoint units are never locked.** `computeUnlockedIds` sequences by array
 * position, but check-ins carry `order: 0` and sit at the END of the authored
 * array (see `kaelyn-adaptive`'s `reading-baseline` / `math-baseline`) precisely
 * because they are not path content — they are placement and progress
 * instruments the system schedules. Sequencing them by position would bury a new
 * learner's baseline placement behind the entire program, which is backwards:
 * placement is the FIRST thing they do. This matches how checkpoints are already
 * treated elsewhere — excluded from the practice shelf and from due reviews.
 */
export function playableUnitIds<T extends CompletableUnit>(
  units: readonly T[],
  activeUnitKeys: ReadonlySet<string> | null,
  completedActivityIds: ReadonlySet<string>,
): Set<string> {
  const visible = curatedUnits(units, activeUnitKeys);
  const open = computeUnlockedIds(visible, startedUnitIds(visible, completedActivityIds));
  for (const unit of visible) {
    if (unit.checkpoint) open.add(unit.id);
  }
  return open;
}

/** `activeUnitKeys` as the set the helpers above expect (null = no curation). */
export function activeUnitKeySet(
  activeUnitKeys: readonly string[] | undefined,
): ReadonlySet<string> | null {
  return activeUnitKeys && activeUnitKeys.length > 0 ? new Set(activeUnitKeys) : null;
}
