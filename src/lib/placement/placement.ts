import type { SkillOutcome, SkillTag } from "@/content";

/**
 * The C1 placement engine (pure, framework-free — mirrors mastery.ts). It maps
 * a baseline check-in's per-skill first-try rate to the set of skills to
 * pre-seed as solid, and a per-skill verdict for the parent panel. Forward-only:
 * it only ever proposes SKIPPING review; it never places a learner below the
 * start.
 */

/** A single probe item's outcome → a first-try rate the thresholds key on. */
export function outcomeToRate(outcome: SkillOutcome): number {
  if (outcome === "solid") return 1;
  if (outcome === "emerging") return 0.5;
  return 0;
}

/** rate >= this → she owns the skill (seed solid). */
export const BREEZED_MIN = 0.8;
/** rate in [MIXED_MIN, BREEZED_MIN) → she'll practice it (do not seed). Only
 *  `bandOf` uses this threshold, so it stays module-private. */
const MIXED_MIN = 0.5;

export type PlacementBand = "breezed" | "mixed" | "not_yet";

export interface PlacementVerdict {
  skill: SkillTag;
  rate: number;
  band: PlacementBand;
}

export interface Placement {
  /** Skills to pre-seed as solid on apply (forward-only). */
  seed: SkillTag[];
  /** Per-skill verdicts, one per entry in `scores`, in insertion order. */
  verdicts: PlacementVerdict[];
}

function bandOf(rate: number): PlacementBand {
  if (rate >= BREEZED_MIN) return "breezed";
  if (rate >= MIXED_MIN) return "mixed";
  return "not_yet";
}

export function computePlacement(scores: Record<string, number>): Placement {
  const verdicts: PlacementVerdict[] = Object.entries(scores).map(([skill, rate]) => ({
    skill,
    rate,
    band: bandOf(rate),
  }));
  return { seed: verdicts.filter((v) => v.band === "breezed").map((v) => v.skill), verdicts };
}
