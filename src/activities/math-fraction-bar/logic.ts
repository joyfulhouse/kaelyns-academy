import {
  mathFractionBarConfig,
  type MathFractionBarConfig,
} from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-fraction-bar. No "use client". */
export const schema = mathFractionBarConfig;

const attempts = z.number().int().min(1).max(20);

export const responseSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        mode: z.literal("partition"),
        partitionCount: z.number().int().min(2).max(4),
        attempts,
      })
      .strict(),
    z
      .object({
        mode: z.literal("identify"),
        selectedSegments: z.array(z.number().int().min(0).max(3)).max(4),
        attempts,
      })
      .strict(),
  ])
  .superRefine((response, context) => {
    if (
      response.mode === "identify" &&
      new Set(response.selectedSegments).size !== response.selectedSegments.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectedSegments"],
        message: "Each selected segment must be unique.",
      });
    }
  });

export type MathFractionBarResponse = z.infer<typeof responseSchema>;

export function validateGenerated(config: unknown): string | null {
  const parsed = schema.safeParse(config);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid fraction bar.");
}

export function isCorrect(
  config: MathFractionBarConfig,
  response: MathFractionBarResponse,
): boolean {
  if (config.mode !== response.mode) return false;

  if (response.mode === "partition") {
    return config.mode === "partition" && response.partitionCount === config.denominator;
  }

  if (config.mode !== "identify") return false;
  const selected = new Set(response.selectedSegments);
  return (
    selected.size === response.selectedSegments.length &&
    selected.size === config.numerator &&
    [...selected].every((index) => index >= 0 && index < config.denominator)
  );
}

export function score(
  config: MathFractionBarConfig,
  response: MathFractionBarResponse,
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

export function skillsAffected(_config: MathFractionBarConfig): SkillTag[] {
  return ["math.fractions.unit"];
}
