import { mathArrayConfig, type MathArrayConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-array. No "use client". */
export const schema = mathArrayConfig;

const attempts = z.number().int().min(1).max(20);
const entered = z.number().int().min(0).max(144);

/** Bounded evidence of the model the child actually constructed. */
export const responseSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("build"),
      builtRows: z.number().int().min(0).max(12),
      attempts,
    })
    .strict(),
  z
    .object({
      mode: z.literal("multiply"),
      revealedRows: z.number().int().min(0).max(12),
      entered,
      attempts,
    })
    .strict(),
  z
    .object({
      mode: z.literal("divide"),
      poolRemaining: z.number().int().min(0).max(144),
      groupCounts: z.array(z.number().int().min(0).max(12)).max(12),
      entered,
      attempts,
    })
    .strict(),
  z
    .object({
      mode: z.literal("area"),
      filledCells: z.array(z.number().int().min(0).max(143)).max(144),
      entered,
      attempts,
    })
    .strict(),
]);
export type MathArrayResponse = z.infer<typeof responseSchema>;

/** The total quantity in the full array (the dividend in "divide"). */
export function totalFor(config: MathArrayConfig): number {
  if (config.mode === "divide") return config.total;
  return config.rows * config.cols;
}

/**
 * The number the child must reach:
 *  - multiply / area → the product (rows*cols).
 *  - divide → the equal share: total / groups.
 *  - build → the array's tile count (rows*cols); building it *is* the answer.
 */
export function expectedFor(config: MathArrayConfig): number {
  if (config.mode === "divide") return config.total / config.groups;
  return totalFor(config); // multiply | area | build
}

/** Plugin-local invariant hook. Central generated-content wiring lands later. */
export function validateGenerated(config: unknown): string | null {
  const parsed = schema.safeParse(config);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid array model.");
}

export function isCorrect(
  config: MathArrayConfig,
  response: MathArrayResponse,
): boolean {
  if (config.mode !== response.mode) return false;

  switch (response.mode) {
    case "build":
      return config.mode === "build" && response.builtRows === config.rows;
    case "multiply":
      return (
        config.mode === "multiply" &&
        response.revealedRows === config.rows &&
        response.entered === expectedFor(config)
      );
    case "divide": {
      if (config.mode !== "divide" || response.poolRemaining !== 0) return false;
      const share = expectedFor(config);
      return (
        response.entered === share &&
        response.groupCounts.length === config.groups &&
        response.groupCounts.every((count) => count === share)
      );
    }
    case "area": {
      if (config.mode !== "area" || response.entered !== expectedFor(config)) return false;
      const expectedCells = totalFor(config);
      const filled = new Set(response.filledCells);
      return (
        filled.size === expectedCells &&
        [...filled].every((index) => index >= 0 && index < expectedCells)
      );
    }
  }
}

export function score(config: MathArrayConfig, response: MathArrayResponse): ActivityScore {
  const reached = isCorrect(config, response);
  const firstTryRate = firstTryRateFromAttempts(reached, response.attempts);

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
