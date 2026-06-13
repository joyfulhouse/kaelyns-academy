import { mathArrayConfig, type MathArrayConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for math-array. No "use client". */
export const schema = mathArrayConfig;

/**
 * What the child did. "build" mode has no number to enter (just constructs the
 * array), so `entered` is the final tile count; the other modes record the
 * number they typed/tapped and how many tries it took.
 */
export interface MathArrayResponse {
  /** The product / quotient the child entered (or filled-tile count in build). */
  entered: number;
  /** Check attempts before it was right (>=1). build mode is always 1. */
  attempts: number;
}

/** The total quantity in the full array (the dividend in "divide"). */
export function totalFor(config: MathArrayConfig): number {
  return config.rows * config.cols;
}

/**
 * The number the child must reach:
 *  - multiply / area → the product (rows*cols), or an explicit `answer`.
 *  - divide → the quotient: total shared into `rows` groups = cols per group,
 *    or an explicit `answer`.
 *  - build → the array's tile count (rows*cols); building it *is* the answer.
 */
export function expectedFor(config: MathArrayConfig): number {
  if (config.answer !== undefined) return config.answer;
  if (config.mode === "divide") return config.cols; // rows groups of `cols`
  return totalFor(config); // multiply | area | build
}

export function score(config: MathArrayConfig, response: MathArrayResponse): ActivityScore {
  const expected = expectedFor(config);
  const reached = response.entered === expected;
  // One activity, one answer: 1 attempt → solid, 2 → emerging, 3+ → still
  // finished but not_yet. build always reaches on the first (no wrong answer).
  const firstTryRate = !reached
    ? 0
    : response.attempts <= 1
      ? 1
      : response.attempts === 2
        ? 0.5
        : 0.2;

  return {
    correct: reached ? 1 : 0,
    total: 1,
    stars: reached ? starsFromAccuracy(firstTryRate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(firstTryRate)),
  };
}

/**
 * Arrays map to the canonical Program 02 math rubric: building an array is the
 * equal-groups/arrays rung; multiply exercises facts; area adds the geometry
 * (area-via-array) lens; divide is the sharing/fact-family rung.
 */
export function skillsAffected(config: MathArrayConfig): SkillTag[] {
  switch (config.mode) {
    case "area":
      return ["math.geometry.area-arrays", "math.mult.facts"];
    case "divide":
      return ["math.div.fact-families"];
    case "multiply":
      return ["math.mult.facts"];
    case "build":
      return ["math.equal-groups.arrays"];
  }
}
