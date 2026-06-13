import { describe, it, expect } from "vitest";
import { expectedFor, score, skillsAffected, totalFor } from "./logic";
import type { MathArrayConfig } from "@/content/activity-configs";

const multiply: MathArrayConfig = { instruction: "3 times 4.", mode: "multiply", rows: 3, cols: 4 };
const area: MathArrayConfig = { instruction: "Cover it.", mode: "area", rows: 2, cols: 5 };
const divide: MathArrayConfig = { instruction: "Share it.", mode: "divide", rows: 3, cols: 4 };
const build: MathArrayConfig = { instruction: "Build it.", mode: "build", rows: 2, cols: 3 };
const withAnswer: MathArrayConfig = {
  instruction: "Tricky.",
  mode: "multiply",
  rows: 3,
  cols: 4,
  answer: 99,
};

describe("math-array totalFor / expectedFor", () => {
  it("total is rows*cols", () => {
    expect(totalFor(multiply)).toBe(12);
    expect(totalFor(divide)).toBe(12);
  });

  it("multiply / area expect the product (rows*cols)", () => {
    expect(expectedFor(multiply)).toBe(12);
    expect(expectedFor(area)).toBe(10);
  });

  it("divide expects the quotient: total shared into `rows` groups = cols", () => {
    expect(expectedFor(divide)).toBe(4); // 12 ÷ 3 = 4
  });

  it("build expects the full tile count", () => {
    expect(expectedFor(build)).toBe(6);
  });

  it("an explicit answer overrides the derived value", () => {
    expect(expectedFor(withAnswer)).toBe(99);
  });
});

describe("math-array score", () => {
  it("3 stars + solid on the first correct attempt", () => {
    const result = score(multiply, { entered: 12, attempts: 1 });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.total).toBe(1);
    expect(result.skillEvidence).toEqual([{ skill: "math.skip-count", outcome: "solid" }]);
  });

  it("2 stars + emerging on the second attempt", () => {
    const result = score(divide, { entered: 4, attempts: 2 });
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "math.skip-count", outcome: "emerging" },
      { skill: "math.fluency", outcome: "emerging" },
    ]);
  });

  it("1 star + not_yet when never reached (still forgiving)", () => {
    const result = score(multiply, { entered: 11, attempts: 3 });
    expect(result.stars).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("build always reaches (no wrong answer): 3 stars", () => {
    const result = score(build, { entered: totalFor(build), attempts: 1 });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
  });
});

describe("math-array skillsAffected", () => {
  it("maps each mode to its skill tags", () => {
    expect(skillsAffected(multiply)).toEqual(["math.skip-count"]);
    expect(skillsAffected(build)).toEqual(["math.skip-count"]);
    expect(skillsAffected(area)).toEqual(["math.skip-count", "math.geometry"]);
    expect(skillsAffected(divide)).toEqual(["math.skip-count", "math.fluency"]);
  });
});
