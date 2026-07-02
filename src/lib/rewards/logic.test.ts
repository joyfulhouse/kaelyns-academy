import { describe, expect, it } from "vitest";
import { earnedStarsForAttempt, sumLedger } from "./logic";

describe("sumLedger", () => {
  it("sums deltas and treats empty as zero", () => {
    expect(sumLedger([])).toBe(0);
    expect(sumLedger([3, 2, -4])).toBe(1);
  });
});

describe("earnedStarsForAttempt (v1 economy rule)", () => {
  it("credits stars for a first authored completion", () => {
    expect(earnedStarsForAttempt({ generated: false, stars: 3, alreadyCompleted: false })).toBe(3);
  });
  it("credits nothing for repeats, generated practice, or zero-star attempts", () => {
    expect(earnedStarsForAttempt({ generated: false, stars: 3, alreadyCompleted: true })).toBe(0);
    expect(earnedStarsForAttempt({ generated: true, stars: 3, alreadyCompleted: false })).toBe(0);
    expect(earnedStarsForAttempt({ generated: false, stars: 0, alreadyCompleted: false })).toBe(0);
  });
});
