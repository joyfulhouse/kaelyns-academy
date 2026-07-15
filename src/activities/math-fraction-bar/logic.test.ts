import { describe, expect, it } from "vitest";
import {
  mathFractionBarConfig,
  type MathFractionBarConfig,
} from "@/content/activity-configs";
import {
  isCorrect,
  responseSchema,
  score,
  skillsAffected,
  validateGenerated,
} from "./logic";

const partition: MathFractionBarConfig = {
  instruction: "Split the bar into fourths.",
  mode: "partition",
  numerator: 1,
  denominator: 4,
};
const identify: MathFractionBarConfig = {
  instruction: "Show two thirds.",
  mode: "identify",
  numerator: 2,
  denominator: 3,
};

describe("math-fraction-bar config", () => {
  it("supports only partition and identify with denominators from 2 through 4", () => {
    expect(mathFractionBarConfig.safeParse(partition).success).toBe(true);
    expect(mathFractionBarConfig.safeParse(identify).success).toBe(true);
    expect(mathFractionBarConfig.safeParse({ ...partition, denominator: 2 }).success).toBe(true);
    expect(mathFractionBarConfig.safeParse({ ...partition, denominator: 1 }).success).toBe(false);
    expect(mathFractionBarConfig.safeParse({ ...partition, denominator: 5 }).success).toBe(false);
    expect(mathFractionBarConfig.safeParse({ ...partition, mode: "compare" }).success).toBe(false);
  });

  it("requires a numerator from 1 through the denominator", () => {
    expect(mathFractionBarConfig.safeParse({ ...identify, numerator: 1 }).success).toBe(true);
    expect(mathFractionBarConfig.safeParse({ ...identify, numerator: 3 }).success).toBe(true);
    expect(mathFractionBarConfig.safeParse({ ...identify, numerator: 0 }).success).toBe(false);
    expect(mathFractionBarConfig.safeParse({ ...identify, numerator: 4 }).success).toBe(false);
  });

  it("rejects duplicate answer fields and expanded fraction modes", () => {
    for (const extra of [
      { answer: "1/4" },
      { decimal: 0.25 },
      { equivalentTo: "2/8" },
      { comparison: "less" },
      { freeText: "one fourth" },
    ]) {
      expect(mathFractionBarConfig.safeParse({ ...partition, ...extra }).success).toBe(false);
    }
  });

  it("validates generated configs with the same narrow contract", () => {
    expect(validateGenerated(partition)).toBeNull();
    expect(validateGenerated({ ...identify, numerator: 4 })).not.toBeNull();
    expect(validateGenerated({ ...partition, answer: 4 })).not.toBeNull();
  });

  it("exposes the validator through the plugin contract", async () => {
    const { mathFractionBar } = await import("./index");
    expect(mathFractionBar.validateGenerated).toBeTypeOf("function");
  });
});

describe("math-fraction-bar response", () => {
  it("bounds partition counts, selected segment indices, uniqueness, and attempts", () => {
    expect(
      responseSchema.safeParse({ mode: "partition", partitionId: "equal", attempts: 1 }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({ mode: "partition", partitionId: "fourths", attempts: 1 }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({ mode: "identify", selectedSegments: [0, 2], attempts: 1 }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({ mode: "identify", selectedSegments: [0, 0], attempts: 1 }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({ mode: "identify", selectedSegments: [4], attempts: 1 }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({ mode: "identify", selectedSegments: [], attempts: 21 }).success,
    ).toBe(false);
  });
});

describe("math-fraction-bar scoring", () => {
  it("scores partitioning from the chosen equal-share geometry", () => {
    expect(
      isCorrect(partition, { mode: "partition", partitionId: "equal", attempts: 1 }),
    ).toBe(true);
    expect(
      isCorrect(partition, { mode: "partition", partitionId: "narrow-first", attempts: 1 }),
    ).toBe(false);
  });

  it("scores identification from bounded selected segment state", () => {
    expect(
      isCorrect(identify, { mode: "identify", selectedSegments: [0, 2], attempts: 1 }),
    ).toBe(true);
    expect(
      isCorrect(identify, { mode: "identify", selectedSegments: [0], attempts: 1 }),
    ).toBe(false);
    expect(
      isCorrect(identify, { mode: "identify", selectedSegments: [0, 3], attempts: 1 }),
    ).toBe(false);
  });

  it("requires the response mode to match the authored operation", () => {
    expect(
      isCorrect(partition, { mode: "identify", selectedSegments: [0], attempts: 1 }),
    ).toBe(false);
  });

  it("derives stars and fraction evidence server-side", () => {
    expect(score(partition, { mode: "partition", partitionId: "equal", attempts: 1 })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.fractions.unit", outcome: "solid" }],
    });
    expect(
      score(partition, { mode: "partition", partitionId: "wide-first", attempts: 2 }),
    ).toEqual({
      correct: 0,
      total: 1,
      stars: 1,
      skillEvidence: [{ skill: "math.fractions.unit", outcome: "not_yet" }],
    });
    expect(skillsAffected(identify)).toEqual(["math.fractions.unit"]);
  });
});
