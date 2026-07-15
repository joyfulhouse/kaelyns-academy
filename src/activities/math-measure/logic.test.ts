import { describe, expect, it } from "vitest";
import { isCorrect, responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const compareCfg = {
  mode: "compare" as const,
  instruction: "",
  attribute: "length" as const,
  question: "most" as const,
  items: [
    { label: "pencil", emoji: "✏️", size: 3 },
    { label: "crayon", emoji: "🖍️", size: 2 },
  ],
  answerIndex: 0,
};
const unitsCfg = {
  mode: "units" as const,
  instruction: "",
  unit: "cube" as const,
  length: 5,
  choices: [4, 5, 6],
  answerIndex: 1,
};

describe("isCorrect", () => {
  it("compare derives the answer from the requested size extreme", () => {
    expect(isCorrect(compareCfg, { attempts: 1, selectedIndex: 0 })).toBe(true);
    expect(isCorrect(compareCfg, { attempts: 1, selectedIndex: 1 })).toBe(false);
    expect(
      isCorrect({ ...compareCfg, answerIndex: 1 }, { attempts: 1, selectedIndex: 0 }),
    ).toBe(true);
  });

  it("units scores the IDs actually placed", () => {
    expect(
      isCorrect(unitsCfg, {
        attempts: 1,
        placedUnitIds: ["unit-1", "unit-2", "unit-3", "unit-4", "unit-5"],
      }),
    ).toBe(true);
    expect(
      isCorrect(unitsCfg, { attempts: 1, placedUnitIds: ["unit-1", "unit-2"] }),
    ).toBe(false);
  });
});

describe("responseSchema", () => {
  it("bounds compare choices and placed unit IDs", () => {
    expect(responseSchema.safeParse({ attempts: 1, selectedIndex: 3 }).success).toBe(true);
    expect(responseSchema.safeParse({ attempts: 1, selectedIndex: 4 }).success).toBe(false);
    expect(
      responseSchema.safeParse({ attempts: 1, placedUnitIds: ["unit-1", "unit-2"] }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({ attempts: 1, placedUnitIds: ["unit-1", "unit-1"] }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        attempts: 1,
        placedUnitIds: Array.from({ length: 13 }, (_, index) => `unit-${index}`),
      }).success,
    ).toBe(false);
  });
});

describe("score", () => {
  it("first-try → 3 stars solid on math.measure", () => {
    expect(score(compareCfg, { attempts: 1, selectedIndex: 0 })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.measure", outcome: "solid" }],
    });
  });
  it("second try → 2 stars emerging", () => {
    const s = score(unitsCfg, {
      attempts: 2,
      placedUnitIds: ["unit-1", "unit-2", "unit-3", "unit-4", "unit-5"],
    });
    expect(s.stars).toBe(2);
    expect(s.skillEvidence[0].outcome).toBe("emerging");
  });
  it("third+ try → 1 star not_yet", () => {
    const s = score(unitsCfg, {
      attempts: 3,
      placedUnitIds: ["unit-1", "unit-2", "unit-3", "unit-4", "unit-5"],
    });
    expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
  it("wrong final selection → 1 star not_yet (never a failure)", () => {
    const s = score(compareCfg, { attempts: 4, selectedIndex: 1 });
    expect(s.correct).toBe(0);
    expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always math.measure", () => {
    expect(skillsAffected(unitsCfg)).toEqual(["math.measure"]);
    expect(skillsAffected(compareCfg)).toEqual(["math.measure"]);
  });
});

describe("validateGenerated (B3 answer-key net)", () => {
  it("accepts a valid compare/units item and rejects a tied compare extreme", () => {
    expect(validateGenerated(compareCfg)).toBeNull(); // 3 is the unique max at index 0
    expect(validateGenerated(unitsCfg)).toBeNull(); // choices[1] === length 5
    expect(
      validateGenerated({ ...compareCfg, items: [
        { label: "a", emoji: "🅰️", size: 3 },
        { label: "b", emoji: "🅱️", size: 3 },
      ] }),
    ).not.toBeNull(); // tied max → ambiguous
  });

  it("rejects a units item whose marked choice is not the true length", () => {
    expect(validateGenerated({ ...unitsCfg, answerIndex: 0 })).not.toBeNull(); // choices[0]=4 !== 5
  });
});
