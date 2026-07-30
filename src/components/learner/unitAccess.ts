/**
 * Which units a learner may open — one derivation, shared by every surface.
 *
 * Three rules compose here:
 *
 *  1. **Curation** (`activeUnitKeys`) — the parent's explicit assignment. This is
 *     access control: it is enforced again server-side on the write path
 *     (`isEnrollmentUnitActive` in `recordAttemptAction`).
 *  2. **Sequencing** — the forgiving world-map pacing, and ONLY for programs
 *     whose units are genuinely ordered (see {@link isSequentialProgram}). This
 *     is NOT access control. It is deliberately not enforced on the write path:
 *     a child who reaches a finished activity by any route must keep the work.
 *  3. **Monotonicity** — anything the learner has already played stays open,
 *     forever. See below.
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
 * Programs whose unit ORDER is pedagogy rather than authoring convenience.
 *
 * `computeUnlockedIds` sequences by array position, so enforcing it only makes
 * sense where position means something. It does for Keyboard Club — you cannot
 * reach for the top row before your fingers know home row. It does NOT for the
 * other served programs, and enforcing it there would be actively wrong:
 *
 *  - `kaelyn-adaptive`'s units are seven parallel SUBJECT STRANDS. Gating them
 *    by array order puts Math behind Reading → Word Study → Writing, directly
 *    contradicting the recommender's documented contract that "each strand
 *    advances INDEPENDENTLY … never lets a strong strand wait on a weak one"
 *    (`src/lib/tutor/recommend.ts`, curriculum README §1).
 *  - `world-languages`' units are four INDEPENDENT languages. Array order would
 *    put Korean behind Mandarin phonetics.
 *
 * Kept in code, keyed by slug, rather than as a `Program` field: the DB-assembled
 * tree is built from explicit columns (`src/lib/content/store.ts`), so a new
 * field would arrive `undefined` for DB-served programs — and content is
 * DB-preferred in production, which would silently disable this everywhere it
 * matters. When marketplace programs need to declare their own pacing, this
 * becomes a real column with an explicit default, not an absent one.
 */
const SEQUENTIAL_PROGRAM_SLUGS: ReadonlySet<string> = new Set(["keyboard-club"]);

export function isSequentialProgram(programSlug: string): boolean {
  return SEQUENTIAL_PROGRAM_SLUGS.has(programSlug);
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

/** A unit holding no activities at all — nothing in it can ever be completed. */
function isEmpty<T extends CompletableUnit>(unit: T): boolean {
  return unit.lessons.every((lesson) => lesson.activities.length === 0);
}

/**
 * The unit ids a learner may actually open: curated in, and — for sequential
 * programs only — unlocked by the learner's own progress.
 *
 * **Access is monotonic.** Every started unit is open, always. `computeUnlockedIds`
 * only ever opens a unit whose PREDECESSOR is started, so on its own it can
 * revoke a unit the child has been playing: assign only Word Study, let her play
 * it for a week, then widen the assignment, and array-order sequencing would lock
 * the very unit she is mid-way through — taking her replays, her due reviews, and
 * her generated shelf with it. Progress may open doors; it must never close one.
 *
 * Sequencing runs over the CURATED list, so a parent who assigns only unit 7 gets
 * unit 7 open (it is the first visible segment) rather than a learner locked out
 * of their own assignment.
 *
 * **Baseline check-ins are never locked.** They carry `order: 0` but sit at the
 * END of the authored array (`kaelyn-adaptive`'s `reading-baseline` /
 * `math-baseline` are positions 8-9 of 9), so position-based sequencing would
 * bury a new learner's placement behind the entire program — backwards, since
 * placement is the first thing they do. Only `baseline` is exempt: `mid` and
 * `final` check-ins are scheduled deliberately later, and exempting them would
 * open a final assessment on day one.
 */
export function playableUnitIds<T extends CompletableUnit>(
  units: readonly T[],
  activeUnitKeys: ReadonlySet<string> | null,
  completedActivityIds: ReadonlySet<string>,
  options: { sequential: boolean },
): Set<string> {
  const visible = curatedUnits(units, activeUnitKeys);
  if (!options.sequential) return new Set(visible.map((unit) => unit.id));

  const played = startedUnitIds(visible, completedActivityIds);
  // An empty unit can never be completed, so it must not BLOCK what follows —
  // but it must not pre-OPEN it either. Treating it as started unconditionally
  // would punch a hole straight through the sequence, opening the empty unit and
  // its successor on day one while the units between stayed locked. That is
  // reachable in production: content is DB-preferred and assembly silently drops
  // an activity row that fails validation. So an empty unit only counts as
  // started once it is itself open, which needs a fixed point — each pass can
  // open another empty unit, which can in turn open the next.
  const empty = visible.filter(isEmpty).map((unit) => unit.id);
  const started = new Set(played);
  let open: Set<string>;
  for (;;) {
    open = computeUnlockedIds(visible, started);
    for (const id of played) open.add(id);
    const advanced = empty.filter((id) => open.has(id) && !started.has(id));
    if (advanced.length === 0) break;
    for (const id of advanced) started.add(id);
  }
  for (const unit of visible) {
    if (unit.checkpoint === "baseline") open.add(unit.id);
  }
  return open;
}

/** `activeUnitKeys` as the set the helpers above expect (null = no curation). */
export function activeUnitKeySet(
  activeUnitKeys: readonly string[] | undefined,
): ReadonlySet<string> | null {
  return activeUnitKeys && activeUnitKeys.length > 0 ? new Set(activeUnitKeys) : null;
}
