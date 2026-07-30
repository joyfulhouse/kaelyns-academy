import { describe, expect, it } from "vitest";
import {
  activeUnitKeySet,
  curatedUnits,
  isSequentialProgram,
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

/** Sequencing only applies to programs whose order is pedagogy. */
const SEQ = { sequential: true } as const;

describe("isSequentialProgram", () => {
  it("sequences Keyboard Club, where home row really does come first", () => {
    expect(isSequentialProgram("keyboard-club")).toBe(true);
  });

  // Gating these by array order would put Math behind Reading/Word Study/Writing
  // and Korean behind Mandarin phonetics, contradicting the recommender's
  // documented contract that each strand advances independently.
  it("leaves parallel-strand programs unsequenced", () => {
    expect(isSequentialProgram("kaelyn-adaptive")).toBe(false);
    expect(isSequentialProgram("world-languages")).toBe(false);
  });

  it("defaults an unknown program to unsequenced", () => {
    expect(isSequentialProgram("some-marketplace-program")).toBe(false);
  });
});

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
  it("does not count an empty unit as started (playableUnitIds owns that rule)", () => {
    const withEmpty = [U("empty", []), U("next", ["n1"])];
    expect(startedUnitIds(withEmpty, new Set())).toEqual(new Set());
  });
});

describe("playableUnitIds — unsequenced programs", () => {
  it("opens every curated unit, because the units are parallel", () => {
    expect(playableUnitIds(PROGRAM, null, new Set(), { sequential: false })).toEqual(
      new Set(["one", "two", "three", "four"]),
    );
  });

  it("still honours parent curation", () => {
    expect(
      playableUnitIds(PROGRAM, new Set(["two", "four"]), new Set(), { sequential: false }),
    ).toEqual(new Set(["two", "four"]));
  });
});

describe("playableUnitIds — sequential programs", () => {
  it("opens only the first unit for a learner with no progress", () => {
    expect(playableUnitIds(PROGRAM, null, new Set(), SEQ)).toEqual(new Set(["one"]));
  });

  it("opens the next unit once the previous one is merely started", () => {
    expect(playableUnitIds(PROGRAM, null, new Set(["a1"]), SEQ)).toEqual(new Set(["one", "two"]));
  });

  it("never opens two units ahead", () => {
    expect(playableUnitIds(PROGRAM, null, new Set(["a1"]), SEQ).has("three")).toBe(false);
  });

  // Progress may open doors; it must never close one. Without this, widening a
  // curated assignment revokes the very unit the child has been playing —
  // taking her replays, her due reviews and her generated shelf with it.
  it("keeps a played unit open even when its predecessor never was", () => {
    const playedLater = new Set(["c1"]);
    const open = playableUnitIds(PROGRAM, null, playedLater, SEQ);
    expect(open.has("three")).toBe(true);
  });

  it("cannot revoke a unit when the parent widens the assignment", () => {
    const played = new Set(["b1"]);
    const whileCurated = playableUnitIds(PROGRAM, new Set(["two"]), played, SEQ);
    expect(whileCurated.has("two")).toBe(true);
    const afterWidening = playableUnitIds(PROGRAM, null, played, SEQ);
    expect(afterWidening.has("two")).toBe(true);
  });

  // The gate must never lock a learner out of the only thing assigned to them.
  it("opens a solely-curated later unit even with zero progress", () => {
    expect(playableUnitIds(PROGRAM, new Set(["four"]), new Set(), SEQ)).toEqual(new Set(["four"]));
  });

  it("sequences within the curated subset, not the full program", () => {
    const curated = new Set(["two", "four"]);
    expect(playableUnitIds(PROGRAM, curated, new Set(), SEQ)).toEqual(new Set(["two"]));
    // Starting the first curated unit opens the next CURATED one, skipping the
    // uncurated unit between them.
    expect(playableUnitIds(PROGRAM, curated, new Set(["b1"]), SEQ)).toEqual(
      new Set(["two", "four"]),
    );
  });

  it("ignores progress in units the parent curated away", () => {
    // "one" is not curated in, so finishing it cannot open "four".
    expect(playableUnitIds(PROGRAM, new Set(["four"]), new Set(["a1"]), SEQ)).toEqual(
      new Set(["four"]),
    );
  });

  it("cannot strand a learner who has completed every open unit", () => {
    const done = new Set(["a1", "a2"]);
    const open = playableUnitIds(PROGRAM, null, done, SEQ);
    const everythingOpenIsDone = PROGRAM.filter((u) => open.has(u.id)).every((u) =>
      u.lessons.every((l) => l.activities.every((a) => done.has(a.id))),
    );
    expect(everythingOpenIsDone).toBe(false);
    expect(open.has("two")).toBe(true);
  });

  it("advances past an empty first unit instead of stranding behind it", () => {
    const withEmptyFirst = [U("empty", []), U("next", ["n1"]), U("last", ["l1"])];
    const open = playableUnitIds(withEmptyFirst, null, new Set(), SEQ);
    expect(open.has("next")).toBe(true);
    expect(open.has("last")).toBe(false);
  });

  it("advances past consecutive empty units (needs a fixed point)", () => {
    const units = [U("e1", []), U("e2", []), U("real", ["r1"]), U("after", ["a1"])];
    const open = playableUnitIds(units, null, new Set(), SEQ);
    expect(open.has("real")).toBe(true);
    expect(open.has("after")).toBe(false);
  });

  // An empty unit must not BLOCK, but must not pre-OPEN either: a unit emptied
  // by a bad edit (assembly silently drops invalid activities) would otherwise
  // open itself and its successor on day one, straight past the locked units
  // in between — exactly the skip sequencing exists to prevent.
  it("does not punch a hole through the middle of the sequence", () => {
    const units = [U("one", ["a1"]), U("two", ["b1"]), U("gap", []), U("four", ["d1"])];
    const open = playableUnitIds(units, null, new Set(), SEQ);
    expect(open).toEqual(new Set(["one"]));
  });

  it("opens both branch heads together and keeps the far branch's tail shut", () => {
    const forked = [
      U("intro", ["i1"]),
      U("left1", ["l1"], "left"),
      U("left2", ["l2"], "left"),
      U("right1", ["r1"], "right"),
    ];
    expect(playableUnitIds(forked, null, new Set(["i1"]), SEQ)).toEqual(
      new Set(["intro", "left1", "right1"]),
    );
  });
});

describe("playableUnitIds — checkpoint phases", () => {
  const withCheckpoints = [
    { ...U("first", ["f1"]) },
    { ...U("midway", ["m1"]), checkpoint: "mid" },
    { ...U("ending", ["e1"]), checkpoint: "final" },
    { ...U("placement", ["p1"]), checkpoint: "baseline" },
  ];

  // Baselines carry order 0 but sit at the END of the authored array, so
  // position-based sequencing would bury a new learner's placement.
  it("never locks a baseline check-in", () => {
    expect(playableUnitIds(withCheckpoints, null, new Set(), SEQ).has("placement")).toBe(true);
  });

  // Mid and final check-ins are scheduled deliberately later; exempting them
  // would open a final assessment on day one.
  it("still sequences mid and final check-ins", () => {
    const open = playableUnitIds(withCheckpoints, null, new Set(), SEQ);
    expect(open.has("midway")).toBe(false);
    expect(open.has("ending")).toBe(false);
  });
});
