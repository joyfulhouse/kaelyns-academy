import { mathTenframeConfig, type MathTenframeConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-tenframe. No "use client". */
export const schema = mathTenframeConfig;

const attempts = z.number().int().min(1).max(20);
const cellSelection = z
  .array(z.number().int().min(0).max(19))
  .max(20)
  .refine((indices) => new Set(indices).size === indices.length, {
    message: "Cell actions must be unique.",
  });

/** Bounded occupancy and operation evidence. No typed total crosses the host. */
export const responseSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("represent"),
      occupiedCells: cellSelection,
      placements: cellSelection,
      attempts,
    })
    .strict(),
  z
    .object({
      mode: z.literal("add"),
      occupiedCells: cellSelection,
      placements: cellSelection,
      attempts,
    })
    .strict(),
  z
    .object({
      mode: z.literal("subtract"),
      occupiedCells: cellSelection,
      removals: cellSelection,
      attempts,
    })
    .strict(),
  z
    .object({
      mode: z.literal("make-ten"),
      occupiedCells: cellSelection,
      placements: cellSelection,
      tenTokens: z.union([z.literal(0), z.literal(1)]),
      tradeAtPlacement: z.number().int().min(0).max(10).nullable(),
      attempts,
    })
    .strict(),
]);
export type MathTenframeResponse = z.infer<typeof responseSchema>;

/** The result derived from the configured representation or operation. */
export function goalFor(config: MathTenframeConfig): number {
  switch (config.mode) {
    case "represent":
      return config.target;
    case "add":
    case "make-ten":
      return config.target + config.addend;
    case "subtract":
      return config.target - config.subtrahend;
  }
}

export function validateGenerated(config: unknown): string | null {
  const parsed = schema.safeParse(config);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid ten-frame model.");
}

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function sameCells(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return new Set(left).size === left.length && left.every((index) => rightSet.has(index));
}

export function isCorrect(
  config: MathTenframeConfig,
  response: MathTenframeResponse,
): boolean {
  if (config.mode !== response.mode) return false;
  const capacity = (config.frames ?? 1) * 10;
  if (response.occupiedCells.some((index) => index >= capacity)) return false;

  switch (response.mode) {
    case "represent":
      return (
        config.mode === "represent" &&
        response.occupiedCells.length === config.target &&
        sameCells(response.occupiedCells, response.placements)
      );
    case "add": {
      if (config.mode !== "add" || response.placements.length !== config.addend) return false;
      if (response.placements.some((index) => index < config.target || index >= capacity)) {
        return false;
      }
      return sameCells(response.occupiedCells, [...range(config.target), ...response.placements]);
    }
    case "subtract": {
      if (config.mode !== "subtract" || response.removals.length !== config.subtrahend) {
        return false;
      }
      if (response.removals.some((index) => index >= config.target)) return false;
      const removed = new Set(response.removals);
      return sameCells(
        response.occupiedCells,
        range(config.target).filter((index) => !removed.has(index)),
      );
    }
    case "make-ten": {
      if (
        config.mode !== "make-ten" ||
        response.tenTokens !== 1 ||
        response.tradeAtPlacement !== 10 - config.target ||
        response.placements.length !== config.addend
      ) {
        return false;
      }
      const beforeTrade = response.placements.slice(0, response.tradeAtPlacement);
      const afterTrade = response.placements.slice(response.tradeAtPlacement);
      if (!sameCells([...range(config.target), ...beforeTrade], range(10))) return false;
      if (afterTrade.some((index) => index < 10 || index >= 20)) return false;
      return sameCells(response.occupiedCells, afterTrade);
    }
  }
}

export function score(
  config: MathTenframeConfig,
  response: MathTenframeResponse,
): ActivityScore {
  const reached = isCorrect(config, response);
  const firstTryRate = firstTryRateFromAttempts(reached, response.attempts);

  return {
    correct: reached ? 1 : 0,
    total: 1,
    stars: reached ? starsFromAccuracy(firstTryRate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(firstTryRate)),
  };
}

/** Evidence stays mode-local; content alignment owns authored-tag wiring. */
export function skillsAffected(config: MathTenframeConfig): SkillTag[] {
  switch (config.mode) {
    case "represent":
      return ["math.counting"];
    case "add":
      return ["math.addition", "math.fluency"];
    case "subtract":
      return ["math.subtraction"];
    case "make-ten":
      return ["math.regrouping"];
  }
}
