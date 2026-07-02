import { describe, expect, it } from "vitest";
import { computeUnlockedIds, pathLabelsByUnitId, segmentUnits } from "./branching";

const U = (id: string, branchKey?: string) => ({ id, branchKey });

describe("segmentUnits", () => {
  it("groups consecutive branch-keyed units into one fork segment", () => {
    const segs = segmentUnits([U("a"), U("b1", "left"), U("b2", "left"), U("c1", "right"), U("d")]);
    expect(segs).toEqual([
      { kind: "solo", unit: U("a") },
      { kind: "fork", branches: [{ key: "left", units: [U("b1", "left"), U("b2", "left")] }, { key: "right", units: [U("c1", "right")] }] },
      { kind: "solo", unit: U("d") },
    ]);
  });
});

describe("computeUnlockedIds", () => {
  const units = [U("a"), U("b1", "left"), U("b2", "left"), U("c1", "right"), U("d")];
  it("unlocks the first segment only, before anything is started", () => {
    expect(computeUnlockedIds(units, new Set())).toEqual(new Set(["a"]));
  });
  it("starting the pre-fork unit unlocks BOTH branch heads (choose your path)", () => {
    expect(computeUnlockedIds(units, new Set(["a"]))).toEqual(new Set(["a", "b1", "c1"]));
  });
  it("progress within a branch unlocks the next unit in THAT branch only", () => {
    expect(computeUnlockedIds(units, new Set(["a", "b1"]))).toEqual(new Set(["a", "b1", "b2", "c1"]));
  });
  it("starting ANY branch unlocks the post-fork segment", () => {
    expect(computeUnlockedIds(units, new Set(["a", "c1"]))).toEqual(
      new Set(["a", "b1", "c1", "d"]),
    );
  });
  it("a fully linear program matches today's behavior", () => {
    const linear = [U("x"), U("y"), U("z")];
    expect(computeUnlockedIds(linear, new Set())).toEqual(new Set(["x"]));
    expect(computeUnlockedIds(linear, new Set(["x"]))).toEqual(new Set(["x", "y"]));
  });
});

describe("pathLabelsByUnitId", () => {
  it("labels a single fork group by first-appearance order, solo units absent", () => {
    const units = [U("a"), U("b1", "left"), U("b2", "left"), U("c1", "right"), U("d")];
    expect(pathLabelsByUnitId(units)).toEqual(
      new Map([
        ["b1", "Path 1"],
        ["b2", "Path 1"],
        ["c1", "Path 2"],
      ]),
    );
  });

  it("THE COLLISION CASE: two fork groups reusing keys don't overwrite each other's labels", () => {
    // Group 1: left, right (in that order) -> left="Path 1", right="Path 2".
    // Group 2: right, left (reversed order) -> right="Path 1", left="Path 2".
    // Keyed by unit id, so the second group's numbering can't clobber the first's.
    const units = [
      U("a"),
      U("b1", "left"),
      U("c1", "right"),
      U("d"),
      U("e1", "right"),
      U("f1", "left"),
      U("g"),
    ];
    expect(pathLabelsByUnitId(units)).toEqual(
      new Map([
        ["b1", "Path 1"],
        ["c1", "Path 2"],
        ["e1", "Path 1"],
        ["f1", "Path 2"],
      ]),
    );
  });

  it("a fully linear program yields an empty map", () => {
    const linear = [U("x"), U("y"), U("z")];
    expect(pathLabelsByUnitId(linear)).toEqual(new Map());
  });
});
