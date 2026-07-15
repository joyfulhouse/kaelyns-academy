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

/** The Player reports the final dot count and how many check attempts it took. */
export const responseSchema = z
  .object({
    /** Dots the child placed (represent) or the running total (add). */
    count: z.number().int().min(0).max(40),
    /** Check attempts before the answer was right (≥1). */
    attempts: z.number().int().min(1).max(100),
  })
  .strict();
export type MathTenframeResponse = z.infer<typeof responseSchema>;

/** The number the child must reach. represent → target; add → target + addend. */
export function goalFor(config: MathTenframeConfig): number {
  if (config.mode === "add") return config.target + (config.addend ?? 0);
  return config.target;
}

export function score(
  config: MathTenframeConfig,
  response: MathTenframeResponse,
): ActivityScore {
  const goal = goalFor(config);
  const reached = response.count === goal;
  const firstTryRate = firstTryRateFromAttempts(reached, response.attempts);

  return {
    correct: reached ? 1 : 0,
    total: 1,
    stars: reached ? starsFromAccuracy(firstTryRate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(firstTryRate)),
  };
}

/** represent → counting; add → addition fluency. */
export function skillsAffected(config: MathTenframeConfig): SkillTag[] {
  return config.mode === "add" ? ["math.addition", "math.fluency"] : ["math.counting"];
}
