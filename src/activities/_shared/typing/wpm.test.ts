import { describe, expect, it } from "vitest";
import { wpm } from "./wpm";

describe("wpm", () => {
  it("uses the standard five-character word", () => {
    expect(wpm(50, 60_000)).toBe(10);
    expect(wpm(25, 60_000)).toBe(5);
  });

  it("rounds to a whole number", () => {
    expect(wpm(13, 60_000)).toBe(3);
  });

  it("returns 0 rather than Infinity for a zero or negative span", () => {
    expect(wpm(10, 0)).toBe(0);
    expect(wpm(10, -5)).toBe(0);
  });

  it("clamps a bogus client clock instead of trusting it", () => {
    expect(wpm(100, 1)).toBe(200);
  });
});
