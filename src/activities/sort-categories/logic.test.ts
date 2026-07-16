import { describe, expect, it } from "vitest";
import type { SortCategoriesConfig } from "@/content/activity-configs";
import { isCorrect, responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const config: SortCategoriesConfig = {
  instruction: "Sort the animals.",
  bins: [
    { id: "land", label: "Land", emoji: "🌳" },
    { id: "water", label: "Water", emoji: "🌊" },
  ],
  items: [
    { label: "Frog", emoji: "🐸", binId: "water" },
    { label: "Dog", emoji: "🐶", binId: "land" },
    { label: "Fish", emoji: "🐟", binId: "water" },
  ],
};

const correctAssignments = [
  { itemIndex: 2, binId: "water" },
  { itemIndex: 0, binId: "water" },
  { itemIndex: 1, binId: "land" },
];

describe("sort-categories response", () => {
  it("accepts bounded, strict item-to-bin assignments", () => {
    expect(
      responseSchema.parse({ attempts: 1, assignments: correctAssignments }),
    ).toEqual({ attempts: 1, assignments: correctAssignments });
    expect(
      responseSchema.safeParse({
        attempts: 1,
        assignments: correctAssignments,
        score: { stars: 3 },
      }).success,
    ).toBe(false);
  });

  it("rejects missing, duplicate, out-of-range, and over-bounded assignments", () => {
    expect(responseSchema.safeParse({ attempts: 1, assignments: correctAssignments.slice(0, 2) }).success).toBe(false);
    expect(
      responseSchema.safeParse({
        attempts: 1,
        assignments: [
          { itemIndex: 0, binId: "water" },
          { itemIndex: 0, binId: "land" },
          { itemIndex: 2, binId: "water" },
        ],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        attempts: 1,
        assignments: [
          { itemIndex: 8, binId: "water" },
          { itemIndex: 1, binId: "land" },
          { itemIndex: 2, binId: "water" },
        ],
      }).success,
    ).toBe(false);
    expect(responseSchema.safeParse({ attempts: 21, assignments: correctAssignments }).success).toBe(false);
  });
});

describe("sort-categories correctness", () => {
  it("derives correctness from authored bin ids regardless of assignment order", () => {
    expect(isCorrect(config, { attempts: 1, assignments: correctAssignments })).toBe(true);
  });

  it("rejects a wrong, missing, duplicate, or unknown assignment without mutating it", () => {
    const wrong = [
      { itemIndex: 0, binId: "land" },
      { itemIndex: 1, binId: "land" },
      { itemIndex: 2, binId: "water" },
    ];
    const snapshot = structuredClone(wrong);
    expect(isCorrect(config, { attempts: 1, assignments: wrong })).toBe(false);
    expect(wrong).toEqual(snapshot);
    expect(
      isCorrect(config, { attempts: 1, assignments: correctAssignments.slice(0, 2) }),
    ).toBe(false);
    expect(
      isCorrect(config, {
        attempts: 1,
        assignments: [
          { itemIndex: 0, binId: "water" },
          { itemIndex: 0, binId: "water" },
          { itemIndex: 2, binId: "water" },
        ],
      }),
    ).toBe(false);
    expect(
      isCorrect(config, {
        attempts: 1,
        assignments: [
          { itemIndex: 0, binId: "space" },
          { itemIndex: 1, binId: "land" },
          { itemIndex: 2, binId: "water" },
        ],
      }),
    ).toBe(false);
  });
});

describe("sort-categories score", () => {
  it("scores a correct first check as solid classification evidence", () => {
    expect(score(config, { attempts: 1, assignments: correctAssignments })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "science.classify", outcome: "solid" }],
    });
  });

  it("uses the number of explicit checks for retry evidence", () => {
    const result = score(config, { attempts: 2, assignments: correctAssignments });
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "science.classify", outcome: "emerging" },
    ]);
  });

  it("reports only the observed classification skill", () => {
    expect(skillsAffected(config)).toEqual(["science.classify"]);
  });
});

describe("sort-categories generated config validation", () => {
  it("accepts unique, fully-used bins", () => {
    expect(validateGenerated(config)).toBeNull();
  });

  it("rejects duplicate or unused bin ids", () => {
    expect(
      validateGenerated({
        ...config,
        items: config.items.map((item) => ({ ...item, binId: "land" })),
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        bins: [
          { id: "land", label: "Land" },
          { id: "land", label: "Ground" },
        ],
      }),
    ).not.toBeNull();
  });
});
