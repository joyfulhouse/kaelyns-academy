import { describe, expect, it } from "vitest";
import { BREEZED_MIN, computePlacement, outcomeToRate } from "./placement";

describe("outcomeToRate", () => {
  it("maps outcomes to first-try rate", () => {
    expect(outcomeToRate("solid")).toBe(1);
    expect(outcomeToRate("emerging")).toBe(0.5);
    expect(outcomeToRate("not_yet")).toBe(0);
  });
});

describe("computePlacement", () => {
  it("seeds only breezed skills (rate >= 0.8) and bands the rest", () => {
    const p = computePlacement({ "math.add": 1, "math.sub": 0.6, "math.mult": 0.2 });
    expect(p.seed).toEqual(["math.add"]);
    expect(p.verdicts).toEqual([
      { skill: "math.add", rate: 1, band: "breezed" },
      { skill: "math.sub", rate: 0.6, band: "mixed" },
      { skill: "math.mult", rate: 0.2, band: "not_yet" },
    ]);
  });
  it("is forward-only: all-low scores seed nothing", () => {
    expect(computePlacement({ "a.x": 0.4, "a.y": 0 }).seed).toEqual([]);
  });
  it("threshold is inclusive at BREEZED_MIN", () => {
    expect(computePlacement({ "a.x": BREEZED_MIN }).seed).toEqual(["a.x"]);
  });
  it("handles an empty score map", () => {
    expect(computePlacement({})).toEqual({ seed: [], verdicts: [] });
  });
});
