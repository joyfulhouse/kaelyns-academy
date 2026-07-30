import { describe, expect, it } from "vitest";
import {
  activeUnitKeySet,
  curatedUnits,
  playableUnitIds,
  startedUnitIds,
} from "./unitAccess";

/** A unit with one lesson holding the given activity ids. */
const U = (id: string, activityIds: string[], branchKey?: string) => ({
  id,
  branchKey,
  lessons: [{ activities: activityIds.map((activityId) => ({ id: activityId })) }],
});

const PROGRAM = [
  U("one", ["a1", "a2"]),
  U("two", ["b1"]),
  U("three", ["c1"]),
  U("four", ["d1"]),
];

describe("activeUnitKeySet", () => {
  it("treats undefined and empty as no curation (never hides the whole program)", () => {
    expect(activeUnitKeySet(undefined)).toBeNull();
    expect(activeUnitKeySet([])).toBeNull();
  });
  it("becomes a set when the parent curated something", () => {
    expect(activeUnitKeySet(["two"])).toEqual(new Set(["two"]));
  });
});

describe("curatedUnits", () => {
  it("passes everything through with no curation", () => {
    expect(curatedUnits(PROGRAM, null).map((u) => u.id)).toEqual(["one", "two", "three", "four"]);
  });
  it("keeps authored order while filtering", () => {
    expect(curatedUnits(PROGRAM, new Set(["three", "one"])).map((u) => u.id)).toEqual([
      "one",
      "three",
    ]);
  });
});

describe("startedUnitIds", () => {
  it("counts a unit as started from a single completed activity", () => {
    expect(startedUnitIds(PROGRAM, new Set(["a2"]))).toEqual(new Set(["one"]));
  });
  it("counts key presence, so a 0-star finish still starts the unit", () => {
    // The caller passes ids of completions regardless of stars earned; this
    // function never sees a score, which is what keeps the gate forgiving.
    expect(startedUnitIds(PROGRAM, new Set(["b1"]))).toEqual(new Set(["two"]));
  });
  it("ignores activity ids that belong to no unit", () => {
    expect(startedUnitIds(PROGRAM, new Set(["ghost"]))).toEqual(new Set());
  });
});

describe("playableUnitIds", () => {
  it("opens only the first unit for a learner with no progress", () => {
    expect(playableUnitIds(PROGRAM, null, new Set())).toEqual(new Set(["one"]));
  });

  it("opens the next unit once the previous one is merely started", () => {
    expect(playableUnitIds(PROGRAM, null, new Set(["a1"]))).toEqual(new Set(["one", "two"]));
  });

  it("never opens two units ahead", () => {
    expect(playableUnitIds(PROGRAM, null, new Set(["a1"])).has("three")).toBe(false);
  });

  // The gate must never lock a learner out of the only thing assigned to them:
  // sequencing runs over the CURATED list, so a lone curated unit is the first
  // segment and therefore open.
  it("opens a solely-curated later unit even with zero progress", () => {
    expect(playableUnitIds(PROGRAM, new Set(["four"]), new Set())).toEqual(new Set(["four"]));
  });

  it("sequences within the curated subset, not the full program", () => {
    const curated = new Set(["two", "four"]);
    expect(playableUnitIds(PROGRAM, curated, new Set())).toEqual(new Set(["two"]));
    // Starting the first curated unit opens the next CURATED one, skipping the
    // uncurated unit between them.
    expect(playableUnitIds(PROGRAM, curated, new Set(["b1"]))).toEqual(new Set(["two", "four"]));
  });

  it("ignores progress in units the parent curated away", () => {
    // "one" is not curated in, so finishing it cannot open "four".
    expect(playableUnitIds(PROGRAM, new Set(["four"]), new Set(["a1"]))).toEqual(
      new Set(["four"]),
    );
  });

  // The forgiving rule is what keeps the hero card from starving: whenever a
  // learner has finished everything open to them, the next unit is open too.
  it("cannot strand a learner who has completed every open unit", () => {
    const done = new Set(["a1", "a2"]);
    const open = playableUnitIds(PROGRAM, null, done);
    const everythingOpenIsDone = PROGRAM.filter((u) => open.has(u.id)).every((u) =>
      u.lessons.every((l) => l.activities.every((a) => done.has(a.id))),
    );
    expect(everythingOpenIsDone).toBe(false);
    expect(open.has("two")).toBe(true);
  });

  it("opens both branch heads together and keeps the far branch's tail shut", () => {
    const forked = [
      U("intro", ["i1"]),
      U("left1", ["l1"], "left"),
      U("left2", ["l2"], "left"),
      U("right1", ["r1"], "right"),
    ];
    expect(playableUnitIds(forked, null, new Set(["i1"]))).toEqual(
      new Set(["intro", "left1", "right1"]),
    );
  });
});
