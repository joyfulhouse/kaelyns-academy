import { describe, it, expect } from "vitest";
import { mathArrayConfig, type MathArrayConfig } from "@/content/activity-configs";
import {
  expectedFor,
  isCorrect,
  responseSchema,
  score,
  skillsAffected,
  totalFor,
  validateGenerated,
} from "./logic";

const multiply: MathArrayConfig = { instruction: "3 times 4.", mode: "multiply", rows: 3, cols: 4 };
const area: MathArrayConfig = { instruction: "Cover it.", mode: "area", rows: 2, cols: 5 };
const divideInput = {
  instruction: "Share it.",
  mode: "divide" as const,
  total: 12,
  groups: 3,
};
const divide: MathArrayConfig = divideInput;
const build: MathArrayConfig = { instruction: "Build it.", mode: "build", rows: 2, cols: 3 };

describe("math-array config", () => {
  it("rejects a contradictory authored answer instead of overriding the model", () => {
    const contradictory = {
      instruction: "Tricky.",
      mode: "multiply",
      rows: 2,
      cols: 3,
      ...{ ["answer"]: 99 },
    };

    expect(mathArrayConfig.safeParse(contradictory).success).toBe(false);
  });

  it("accepts exact bounded sharing and rejects an inexact share", () => {
    expect(mathArrayConfig.safeParse(divideInput).success).toBe(true);
    expect(
      mathArrayConfig.safeParse({
        instruction: "Share it.",
        mode: "divide",
        total: 10,
        groups: 3,
      }).success,
    ).toBe(false);
  });

  it("exports a plugin-local generated-config validator", async () => {
    const logic = await import("./logic");
    expect(logic).toHaveProperty("validateGenerated");
  });

  it("exposes the validator through the plugin contract", async () => {
    const { mathArray } = await import("./index");
    expect(mathArray.validateGenerated).toBeTypeOf("function");
  });

  it("validates bounded dimensions, exact division, and contradictory fields", () => {
    expect(validateGenerated(multiply)).toBeNull();
    expect(validateGenerated({ ...multiply, rows: 0 })).not.toBeNull();
    expect(validateGenerated({ ...divideInput, total: 10 })).not.toBeNull();
    expect(
      validateGenerated({ ...multiply, ...{ ["answer"]: 99 } }),
    ).not.toBeNull();
  });
});

describe("math-array totalFor / expectedFor", () => {
  it("total is rows*cols", () => {
    expect(totalFor(multiply)).toBe(12);
    expect(totalFor(divide)).toBe(12);
  });

  it("multiply / area expect the product (rows*cols)", () => {
    expect(expectedFor(multiply)).toBe(12);
    expect(expectedFor(area)).toBe(10);
  });

  it("divide derives the equal share from total and groups", () => {
    expect(expectedFor(divide)).toBe(4); // 12 ÷ 3 = 4
  });

  it("build expects the full tile count", () => {
    expect(expectedFor(build)).toBe(6);
  });

});

describe("math-array score", () => {
  it("rejects the old number-only response and over-bounded model evidence", () => {
    expect(responseSchema.safeParse({ entered: 12, attempts: 1 }).success).toBe(false);
    expect(
      responseSchema.safeParse({
        mode: "area",
        filledCells: Array.from({ length: 145 }, (_, index) => index),
        entered: 145,
        attempts: 1,
      }).success,
    ).toBe(false);
  });

  it("requires the named model operation as well as the derived result", () => {
    expect(
      isCorrect(multiply, {
        mode: "multiply",
        revealedRows: 2,
        entered: 12,
        attempts: 1,
      }),
    ).toBe(false);
    expect(
      isCorrect(divide, {
        mode: "divide",
        poolRemaining: 1,
        groupCounts: [4, 4, 3],
        entered: 4,
        attempts: 1,
      }),
    ).toBe(false);
    expect(
      isCorrect(area, {
        mode: "area",
        filledCells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        entered: 10,
        attempts: 1,
      }),
    ).toBe(false);
  });

  it("3 stars + solid on the first correct attempt", () => {
    const result = score(multiply, {
      mode: "multiply",
      revealedRows: 3,
      entered: 12,
      attempts: 1,
    });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.total).toBe(1);
    expect(result.skillEvidence).toEqual([{ skill: "math.mult.facts", outcome: "solid" }]);
  });

  it("2 stars + emerging on the second attempt", () => {
    const result = score(divide, {
      mode: "divide",
      poolRemaining: 0,
      groupCounts: [4, 4, 4],
      entered: 4,
      attempts: 2,
    });
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "math.div.fact-families", outcome: "emerging" },
    ]);
  });

  it("1 star + not_yet when never reached (still forgiving)", () => {
    const result = score(multiply, {
      mode: "multiply",
      revealedRows: 3,
      entered: 11,
      attempts: 3,
    });
    expect(result.stars).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("build always reaches (no wrong answer): 3 stars", () => {
    const result = score(build, { mode: "build", builtRows: 2, attempts: 1 });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
  });

  it("accepts complete unit-square coverage in area mode", () => {
    expect(
      isCorrect(area, {
        mode: "area",
        filledCells: Array.from({ length: 10 }, (_, index) => index),
        entered: 10,
        attempts: 1,
      }),
    ).toBe(true);
  });
});

describe("math-array skillsAffected", () => {
  it("maps each mode to its skill tags", () => {
    expect(skillsAffected(multiply)).toEqual(["math.mult.facts"]);
    expect(skillsAffected(build)).toEqual(["math.equal-groups.arrays"]);
    expect(skillsAffected(area)).toEqual(["math.geometry.area-arrays", "math.mult.facts"]);
    expect(skillsAffected(divide)).toEqual(["math.div.fact-families"]);
  });
});
