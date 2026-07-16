import { describe, expect, it } from "vitest";
import { mathMeasureConfig } from "./math-measure";

describe("math-measure cross-field invariants", () => {
  it("rejects an out-of-range, tied, or contradictory comparison answer", () => {
    const base = {
      mode: "compare" as const,
      instruction: "Which is longest?",
      attribute: "length" as const,
      question: "most" as const,
      items: [
        { label: "pencil", emoji: "✏️", size: 3 },
        { label: "crayon", emoji: "🖍️", size: 2 },
      ],
    };
    expect(mathMeasureConfig.safeParse({ ...base, answerIndex: 2 }).success).toBe(false);
    expect(mathMeasureConfig.safeParse({ ...base, answerIndex: 1 }).success).toBe(false);
    expect(
      mathMeasureConfig.safeParse({
        ...base,
        items: [
          { label: "pencil", emoji: "✏️", size: 3 },
          { label: "crayon", emoji: "🖍️", size: 3 },
        ],
        answerIndex: 0,
      }).success,
    ).toBe(false);
  });

  it("accepts a direct unit-placement item without answer choices", () => {
    expect(
      mathMeasureConfig.safeParse({
        mode: "units",
        instruction: "Measure the shoe.",
        objectLabel: "shoe",
        unit: "cube",
        length: 5,
      }).success,
    ).toBe(true);
  });

  it("rejects a legacy units answer that contradicts the visual length", () => {
    expect(
      mathMeasureConfig.safeParse({
        mode: "units",
        instruction: "How many cubes?",
        unit: "cube",
        length: 5,
        choices: [4, 5, 6],
        answerIndex: 0,
      }).success,
    ).toBe(false);
  });

  it("requires exactly two items for a two-pan weight comparison", () => {
    expect(
      mathMeasureConfig.safeParse({
        mode: "compare",
        instruction: "Which is heaviest?",
        attribute: "weight",
        question: "most",
        items: [
          { label: "feather", emoji: "🪶", size: 1 },
          { label: "apple", emoji: "🍎", size: 2 },
          { label: "watermelon", emoji: "🍉", size: 4 },
        ],
        answerIndex: 2,
      }).success,
    ).toBe(false);
  });
});
