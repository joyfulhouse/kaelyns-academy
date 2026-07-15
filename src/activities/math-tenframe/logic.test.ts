import { describe, it, expect } from "vitest";
import { mathTenframeConfig, type MathTenframeConfig } from "@/content/activity-configs";
import {
  goalFor,
  isCorrect,
  responseSchema,
  score,
  skillsAffected,
  validateGenerated,
} from "./logic";

const represent: MathTenframeConfig = { instruction: "Show 7.", mode: "represent", target: 7, frames: 1 };
const add: MathTenframeConfig = { instruction: "8 + 5.", mode: "add", target: 8, addend: 5, frames: 2 };
const subtract = {
  instruction: "Start at 13. Take away 5.",
  mode: "subtract" as const,
  target: 13,
  subtrahend: 5,
  frames: 2 as const,
} as unknown as MathTenframeConfig;
const makeTen = {
  instruction: "Make a ten, then keep adding.",
  mode: "make-ten" as const,
  target: 7,
  addend: 8,
  frames: 2 as const,
} as unknown as MathTenframeConfig;

describe("math-tenframe config invariants", () => {
  it("accepts exactly represent, add, subtract, and make-ten", () => {
    expect(mathTenframeConfig.safeParse(represent).success).toBe(true);
    expect(mathTenframeConfig.safeParse(add).success).toBe(true);
    expect(mathTenframeConfig.safeParse(subtract).success).toBe(true);
    expect(mathTenframeConfig.safeParse(makeTen).success).toBe(true);
    expect(
      mathTenframeConfig.safeParse({
        instruction: "Group by five.",
        mode: "group",
        target: 20,
        frames: 2,
      }).success,
    ).toBe(false);
  });

  it("rejects results outside one- or two-frame capacity", () => {
    expect(
      mathTenframeConfig.safeParse({
        instruction: "Show 11.",
        mode: "represent",
        target: 11,
        frames: 1,
      }).success,
    ).toBe(false);
    expect(
      mathTenframeConfig.safeParse({
        instruction: "Add.",
        mode: "add",
        target: 8,
        addend: 5,
        frames: 1,
      }).success,
    ).toBe(false);
    expect(
      mathTenframeConfig.safeParse({
        instruction: "Subtract.",
        mode: "subtract",
        target: 4,
        subtrahend: 5,
        frames: 1,
      }).success,
    ).toBe(false);
    expect(
      mathTenframeConfig.safeParse({
        instruction: "Trade.",
        mode: "make-ten",
        target: 7,
        addend: 14,
        frames: 2,
      }).success,
    ).toBe(false);
  });
});

describe("math-tenframe goalFor", () => {
  it("represent goal is the target", () => {
    expect(goalFor(represent)).toBe(7);
  });
  it("add goal is target + addend", () => {
    expect(goalFor(add)).toBe(13);
  });
  it("subtract goal is the non-negative difference", () => {
    expect(goalFor(subtract)).toBe(8);
  });
  it("make-ten goal is the sum after the visible trade", () => {
    expect(goalFor(makeTen)).toBe(15);
  });
});

describe("math-tenframe score", () => {
  it("rejects the old typed-count response and over-bounded cell actions", () => {
    expect(responseSchema.safeParse({ count: 7, attempts: 1 }).success).toBe(false);
    expect(
      responseSchema.safeParse({
        mode: "represent",
        occupiedCells: Array.from({ length: 21 }, (_, index) => index),
        placements: [],
        attempts: 1,
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        mode: "represent",
        occupiedCells: [0],
        placements: [0],
        attempts: 21,
      }).success,
    ).toBe(false);
  });

  it("requires bounded occupancy and operation actions, never a typed total", () => {
    expect(
      isCorrect(represent, {
        mode: "represent",
        occupiedCells: [0, 1, 2, 3, 4, 5, 6],
        placements: [0, 1, 2, 3, 4, 5, 6],
        attempts: 1,
      }),
    ).toBe(true);
    expect(
      isCorrect(add, {
        mode: "add",
        occupiedCells: Array.from({ length: 13 }, (_, index) => index),
        placements: [8, 9, 10, 11, 12],
        attempts: 1,
      }),
    ).toBe(true);
    expect(
      isCorrect(subtract, {
        mode: "subtract",
        occupiedCells: [5, 6, 7, 8, 9, 10, 11, 12],
        removals: [0, 1, 2, 3, 4],
        attempts: 1,
      }),
    ).toBe(true);
    expect(
      isCorrect(makeTen, {
        mode: "make-ten",
        occupiedCells: [10, 11, 12, 13, 14],
        placements: [7, 8, 9, 10, 11, 12, 13, 14],
        tenTokens: 1,
        tradeAtPlacement: 3,
        attempts: 1,
      }),
    ).toBe(true);
  });

  it("does not accept make-ten work until the full-frame trade occurred", () => {
    expect(
      isCorrect(makeTen, {
        mode: "make-ten",
        occupiedCells: Array.from({ length: 15 }, (_, index) => index),
        placements: [7, 8, 9, 10, 11, 12, 13, 14],
        tenTokens: 0,
        tradeAtPlacement: null,
        attempts: 1,
      }),
    ).toBe(false);
  });

  it("3 stars + solid when the goal is reached on the first attempt", () => {
    const result = score(represent, {
      mode: "represent",
      occupiedCells: [0, 1, 2, 3, 4, 5, 6],
      placements: [0, 1, 2, 3, 4, 5, 6],
      attempts: 1,
    });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.total).toBe(1);
    expect(result.skillEvidence).toEqual([{ skill: "math.counting", outcome: "solid" }]);
  });

  it("2 stars + emerging on the second attempt", () => {
    const result = score(add, {
      mode: "add",
      occupiedCells: Array.from({ length: 13 }, (_, index) => index),
      placements: [8, 9, 10, 11, 12],
      attempts: 2,
    });
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "math.addition", outcome: "emerging" },
      { skill: "math.fluency", outcome: "emerging" },
    ]);
  });

  it("1 star + not_yet when the goal was never reached (still forgiving)", () => {
    const result = score(represent, {
      mode: "represent",
      occupiedCells: [0, 1, 2, 3, 4],
      placements: [0, 1, 2, 3, 4],
      attempts: 3,
    });
    expect(result.stars).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("derives skills by mode", () => {
    expect(skillsAffected(represent)).toEqual(["math.counting"]);
    expect(skillsAffected(add)).toEqual(["math.addition", "math.fluency"]);
    expect(skillsAffected(subtract)).toEqual(["math.subtraction"]);
    expect(skillsAffected(makeTen)).toEqual(["math.add.make-ten"]);
  });
});

describe("math-tenframe plugin-local invariant", () => {
  it("accepts a capacity-safe config and rejects invalid operation results", () => {
    expect(validateGenerated(add)).toBeNull();
    expect(validateGenerated({ ...add, frames: 1 })).not.toBeNull();
    expect(validateGenerated({ ...makeTen, target: 2, addend: 3 })).not.toBeNull();
  });

  it("exposes the invariant through the plugin contract", async () => {
    const { mathTenframe } = await import("./index");
    expect(mathTenframe.validateGenerated).toBeTypeOf("function");
  });
});
