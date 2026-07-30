import { describe, expect, it } from "vitest";
import { PROGRAMS } from "@/content";
import { isSequentialProgram, playableUnitIds } from "./unitAccess";

/**
 * The starvation guard, against real curriculum.
 *
 * Sequencing filters the hero pick, the warm-up row, and quest destinations —
 * not just the map's tiles — so that nothing is ever offered that the activity
 * route would then refuse. The cost of getting that wrong is the opposite
 * failure: a child with somewhere legitimate to go and nothing on offer, staring
 * at an empty "One Big GO".
 *
 * These walk every real program the way a child does and assert that at every
 * step there is still an open unit holding unfinished work. The forgiving rule
 * (a unit opens as soon as the previous one is *started*) is what makes this
 * hold for sequential programs, so these fail loudly if it is ever tightened.
 */

type ProgramUnit = (typeof PROGRAMS)[number]["units"][number];

/** Every activity id in a unit, in authored order. */
function activityIds(unit: ProgramUnit): string[] {
  return unit.lessons.flatMap((lesson) => lesson.activities.map((a) => a.id));
}

describe.each(PROGRAMS.map((p) => [p.slug, p] as const))(
  "unit sequencing never strands a learner in %s",
  (slug, program) => {
    const options = { sequential: isSequentialProgram(slug) };
    const open = (completed: ReadonlySet<string>) =>
      playableUnitIds(program.units, null, completed, options);

    it("opens something to play before any progress exists", () => {
      expect(open(new Set()).size).toBeGreaterThan(0);
    });

    it("always leaves an open unit with unfinished work, all the way through", () => {
      const completed = new Set<string>();
      // Walk the authored path one activity at a time — the slowest possible
      // advance, and the one most likely to expose a gap.
      for (const unit of program.units) {
        for (const id of activityIds(unit)) {
          const openNow = open(completed);
          const hasSomethingToDo = program.units
            .filter((candidate) => openNow.has(candidate.id))
            .some((candidate) => activityIds(candidate).some((a) => !completed.has(a)));
          expect(
            hasSomethingToDo,
            `stranded before completing ${id}: open units ${[...openNow].join(", ") || "(none)"}`,
          ).toBe(true);
          completed.add(id);
        }
      }
      expect(open(completed).size).toBeGreaterThan(0);
    });

    // Access is monotonic: whatever the child has played stays reachable, in any
    // completion order — not only the tidy front-to-back one above.
    it("never revokes a unit the learner has already played", () => {
      for (const unit of program.units) {
        const first = activityIds(unit)[0];
        if (first === undefined) continue;
        expect(
          open(new Set([first])).has(unit.id),
          `${unit.id} was revoked after being played`,
        ).toBe(true);
      }
    });

    it("opens every single-unit curation, whatever its position", () => {
      for (const unit of program.units) {
        const only = playableUnitIds(program.units, new Set([unit.id]), new Set(), options);
        expect(only.has(unit.id), `${unit.id} locked as a lone assignment`).toBe(true);
      }
    });
  },
);

describe("parallel-strand programs are not gated against each other", () => {
  // The recommender's contract: "each strand advances INDEPENDENTLY … never
  // lets a strong strand wait on a weak one" (recommend.ts, curriculum README
  // §1). Array position is authoring order there, not pedagogy.
  it.each(["kaelyn-adaptive", "world-languages"])("opens every unit of %s at once", (slug) => {
    const program = PROGRAMS.find((p) => p.slug === slug);
    expect(program, `${slug} is missing from PROGRAMS`).toBeDefined();
    if (!program) return;
    const open = playableUnitIds(program.units, null, new Set(), {
      sequential: isSequentialProgram(slug),
    });
    expect(open.size).toBe(program.units.length);
  });

  it("still paces Keyboard Club, where order is real", () => {
    const program = PROGRAMS.find((p) => p.slug === "keyboard-club");
    expect(program).toBeDefined();
    if (!program) return;
    const open = playableUnitIds(program.units, null, new Set(), {
      sequential: isSequentialProgram("keyboard-club"),
    });
    expect(open).toEqual(new Set([program.units[0].id]));
  });
});
