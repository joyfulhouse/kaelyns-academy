import { describe, it, expect } from "vitest";
import { goalFor, score, skillsAffected } from "./logic";
import type { MathTenframeConfig } from "@/content/activity-configs";

const represent: MathTenframeConfig = { instruction: "Show 7.", mode: "represent", target: 7, frames: 1 };
const add: MathTenframeConfig = { instruction: "8 + 5.", mode: "add", target: 8, addend: 5, frames: 2 };

describe("math-tenframe goalFor", () => {
  it("represent goal is the target", () => {
    expect(goalFor(represent)).toBe(7);
  });
  it("add goal is target + addend", () => {
    expect(goalFor(add)).toBe(13);
  });
});

describe("math-tenframe score", () => {
  it("3 stars + solid when the goal is reached on the first attempt", () => {
    const result = score(represent, { count: 7, attempts: 1 });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.total).toBe(1);
    expect(result.skillEvidence).toEqual([{ skill: "math.counting", outcome: "solid" }]);
  });

  it("2 stars + emerging on the second attempt", () => {
    const result = score(add, { count: 13, attempts: 2 });
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "math.addition", outcome: "emerging" },
      { skill: "math.fluency", outcome: "emerging" },
    ]);
  });

  it("1 star + not_yet when the goal was never reached (still forgiving)", () => {
    const result = score(represent, { count: 5, attempts: 3 });
    expect(result.stars).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("derives skills by mode", () => {
    expect(skillsAffected(represent)).toEqual(["math.counting"]);
    expect(skillsAffected(add)).toEqual(["math.addition", "math.fluency"]);
  });
});
