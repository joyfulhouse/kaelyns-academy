import { describe, expect, it } from "vitest";
import { PROGRAMS } from "@/content";
import { playableUnitIds } from "./unitAccess";

/**
 * The starvation guard.
 *
 * Sequencing now filters the hero pick, the warm-up row, and quest destinations
 * — not just the map's tiles — so that nothing is ever offered that the activity
 * route would then refuse. The cost of getting that wrong is the opposite
 * failure: a child with somewhere legitimate to go and nothing on offer, staring
 * at an empty "One Big GO".
 *
 * These walk every real program the way a child does and assert that at every
 * step there is still an open unit holding unfinished work. The forgiving rule
 * (a unit opens as soon as the previous one is *started*) is what makes this
 * hold, so these tests fail loudly if that rule is ever tightened.
 */

/** Every activity id in a unit, in authored order. */
function activityIds(unit: PROGRAM_UNIT): string[] {
  return unit.lessons.flatMap((lesson) => lesson.activities.map((a) => a.id));
}
type PROGRAM_UNIT = (typeof PROGRAMS)[number]["units"][number];

describe.each(PROGRAMS.map((p) => [p.slug, p] as const))(
  "unit sequencing never strands a learner in %s",
  (_slug, program) => {
    it("opens something to play before any progress exists", () => {
      const open = playableUnitIds(program.units, null, new Set());
      expect(open.size).toBeGreaterThan(0);
    });

    it("always leaves an open unit with unfinished work, all the way through", () => {
      const completed = new Set<string>();
      // Walk the authored path one activity at a time — the slowest possible
      // advance, and the one most likely to expose a gap.
      for (const unit of program.units) {
        for (const id of activityIds(unit)) {
          const open = playableUnitIds(program.units, null, completed);
          const hasSomethingToDo = program.units
            .filter((candidate) => open.has(candidate.id))
            .some((candidate) => activityIds(candidate).some((a) => !completed.has(a)));
          expect(
            hasSomethingToDo,
            `stranded before completing ${id}: open units ${[...open].join(", ") || "(none)"}`,
          ).toBe(true);
          completed.add(id);
        }
      }
      // Only once the entire program is finished may the open set hold no work.
      const finalOpen = playableUnitIds(program.units, null, completed);
      expect(finalOpen.size).toBeGreaterThan(0);
    });

    it("opens the next unit the moment the previous one is touched, not finished", () => {
      if (program.units.length < 2) return;
      const [first, second] = program.units;
      const firstActivity = activityIds(first)[0];
      expect(firstActivity).toBeDefined();
      const open = playableUnitIds(program.units, null, new Set([firstActivity]));
      expect(open.has(second.id)).toBe(true);
    });

    // Check-ins carry order 0 but sit at the END of the authored array, so
    // position-based sequencing would bury a new learner's placement behind the
    // whole program. Placement is the first thing they do.
    it("never locks a checkpoint unit, even with zero progress", () => {
      const open = playableUnitIds(program.units, null, new Set());
      for (const unit of program.units.filter((u) => u.checkpoint)) {
        expect(open.has(unit.id), `checkpoint ${unit.id} was locked`).toBe(true);
      }
    });

    it("opens every single-unit curation, whatever its position", () => {
      for (const unit of program.units) {
        const open = playableUnitIds(program.units, new Set([unit.id]), new Set());
        expect(open.has(unit.id), `${unit.id} locked as a lone assignment`).toBe(true);
      }
    });
  },
);
