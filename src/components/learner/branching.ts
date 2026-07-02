/** Branching world-map model (spec §4.4). Pure — unit-tested without React. */

interface BranchableUnit {
  id: string;
  branchKey?: string;
}

export type Segment<T extends BranchableUnit> =
  | { kind: "solo"; unit: T }
  | { kind: "fork"; branches: { key: string; units: T[] }[] };

/** Consecutive non-null branchKey units form ONE fork segment; branches keep
 *  first-appearance order; everything else is a solo segment. */
export function segmentUnits<T extends BranchableUnit>(units: T[]): Segment<T>[] {
  const segments: Segment<T>[] = [];
  let fork: { key: string; units: T[] }[] | null = null;
  for (const unit of units) {
    if (unit.branchKey) {
      fork ??= [];
      let branch = fork.find((b) => b.key === unit.branchKey);
      if (!branch) {
        branch = { key: unit.branchKey, units: [] };
        fork.push(branch);
      }
      branch.units.push(unit);
    } else {
      if (fork) {
        segments.push({ kind: "fork", branches: fork });
        fork = null;
      }
      segments.push({ kind: "solo", unit });
    }
  }
  if (fork) segments.push({ kind: "fork", branches: fork });
  return segments;
}

/** Per-UNIT path labels ("Path 1", "Path 2", …) numbered by first appearance
 *  WITHIN each fork group — reusing a branchKey in a later group can't
 *  collide because the map is keyed by unit id, not branch key. */
export function pathLabelsByUnitId<T extends { id: string; branchKey?: string }>(
  units: T[],
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const seg of segmentUnits(units)) {
    if (seg.kind !== "fork") continue;
    seg.branches.forEach((branch, bi) => {
      const label = `Path ${bi + 1}`;
      for (const unit of branch.units) {
        labels.set(unit.id, label);
      }
    });
  }
  return labels;
}

function segmentStarted<T extends BranchableUnit>(seg: Segment<T>, started: Set<string>): boolean {
  if (seg.kind === "solo") return started.has(seg.unit.id);
  // A fork segment "starts" the NEXT segment only once at least one branch has
  // been carried through to its LAST unit (started that unit) — a single-unit
  // branch's head IS its last unit, so "started that branch" and "finished that
  // branch" coincide there (see the "starting ANY branch" test). A multi-unit
  // branch's head starting is NOT enough on its own; that only advances within
  // the branch (see computeUnlockedIds below) — it does not yet open what comes
  // after the fork.
  return seg.branches.some((b) => {
    const last = b.units.at(-1);
    return last !== undefined && started.has(last.id);
  });
}

/**
 * Forgiving unlock (extends today's "previous started" gate):
 * first segment open; each later segment opens when the previous segment is
 * started; inside a fork, every branch HEAD opens with the segment, and each
 * later unit opens when its predecessor IN THE SAME BRANCH is started.
 */
export function computeUnlockedIds<T extends BranchableUnit>(
  units: T[],
  started: Set<string>,
): Set<string> {
  const unlocked = new Set<string>();
  const segments = segmentUnits(units);
  segments.forEach((seg, i) => {
    const open = i === 0 || segmentStarted(segments[i - 1], started);
    if (!open) return;
    if (seg.kind === "solo") {
      unlocked.add(seg.unit.id);
      return;
    }
    for (const branch of seg.branches) {
      branch.units.forEach((u, j) => {
        if (j === 0 || started.has(branch.units[j - 1].id)) unlocked.add(u.id);
      });
    }
  });
  return unlocked;
}
