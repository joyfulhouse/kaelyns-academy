import { describe, expect, it } from "vitest";
import { wpm } from "./wpm";

describe("wpm", () => {
  it("computes chars/5 per minute", () => {
    expect(wpm(25, 60_000)).toBe(5); // 25 chars in 1min = 5 wpm
    expect(wpm(50, 120_000)).toBe(5);
  });
  it("rounds to whole words for kid display", () => {
    expect(wpm(23, 60_000)).toBe(5); // 4.6 → 5
  });
  it("is 0 for zero or negative elapsed", () => {
    expect(wpm(25, 0)).toBe(0);
    expect(wpm(25, -5)).toBe(0);
  });
});
