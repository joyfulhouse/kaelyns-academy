import type { ActivityScore, SkillOutcome, SkillTag } from "@/content/types";

/**
 * Shared, server-safe scoring helpers. The kid surface is forgiving (PRODUCT.md
 * §2): a wrong answer is data for the tutor, never a failure for the child. So
 * "score" measures *how much help was needed to succeed*, not pass/fail. Every
 * activity is completed before it scores; stars reflect independence.
 */

/**
 * Map a first-try success rate (0..1) to earned stars. Thresholds are shared
 * with `outcomeFromAccuracy` so stars and skill evidence always agree:
 *   3★ ⇔ solid (everything first try) · 2★ ⇔ emerging (≥ half first try) ·
 *   1★ ⇔ not_yet. Never 0 when the child finished: showing up earns a star.
 */
export function starsFromAccuracy(firstTryRate: number): 0 | 1 | 2 | 3 {
  if (firstTryRate >= 0.999) return 3;
  if (firstTryRate >= 0.5) return 2;
  return 1;
}

/** Per-skill outcome from a first-try success rate (DESIGN.md skill evidence). */
export function outcomeFromAccuracy(firstTryRate: number): SkillOutcome {
  if (firstTryRate >= 0.999) return "solid";
  if (firstTryRate >= 0.5) return "emerging";
  return "not_yet";
}

/** Attach the same outcome to every affected skill (most activities). */
export function evenSkillEvidence(
  skills: SkillTag[],
  outcome: SkillOutcome,
): ActivityScore["skillEvidence"] {
  return skills.map((skill) => ({ skill, outcome }));
}

/**
 * First-try success rate for a single-check activity from the attempt count:
 * finished on the first check → 1 (solid), second → 0.5 (emerging), later → 0.2
 * (finished, not-yet). Not finished → 0. Shared by every single-check plugin so
 * the stars/outcome ladder is identical everywhere.
 */
export function firstTryRateFromAttempts(correct: boolean, attempts: number): number {
  if (!correct) return 0;
  if (attempts <= 1) return 1;
  if (attempts === 2) return 0.5;
  return 0.2;
}
