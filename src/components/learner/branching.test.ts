import { describe, expect, it } from "vitest";
import { computeUnlockedIds, segmentUnits } from "./branching";

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
