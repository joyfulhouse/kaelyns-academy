import { oralReadingConfig, type OralReadingConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import type { OralReadingMatchResult } from "@/lib/ai/oralReadingMatch";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for oral-reading. No transcript is accepted. */
export const schema = oralReadingConfig;

export interface OralReadingResponse {
  /** Count of completed verification results. */
  attempts: number;
  /** Child-safe result for each completed verification; never transcript text. */
  results: OralReadingMatchResult[];
  /** True when verification completed through any forgiving fallback path. */
  fallbackUsed: boolean;
  /** Derived fluency evidence for sentence mode; never a client-timed value. */
  wcpm?: number;
  /** One child-safe state per authored passage word. */
  perWord?: { state: "correct" | "unclear" }[];
  correctCount?: number;
  totalWords?: number;
}

export function score(config: OralReadingConfig, response: OralReadingResponse): ActivityScore {
  if (config.mode === "sentence") return scoreSentence(config, response);

  const matchedAt = response.results.indexOf("matched");
  const matched = matchedAt !== -1;
  const rate = firstTryRateFromAttempts(matched, matchedAt + 1);
  return {
    correct: matched ? 1 : 0,
    total: 1,
    stars: matched ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

function scoreSentence(
  config: Extract<OralReadingConfig, { mode: "sentence" }>,
  response: OralReadingResponse,
): ActivityScore {
  const authoredTotal = config.passage.trim().split(/\s+/).length;
  const total = Math.max(1, response.totalWords ?? authoredTotal);
  const derivedCorrect =
    response.correctCount ??
    response.perWord?.filter(({ state }) => state === "correct").length ??
    (response.results.includes("matched") ? total : 0);
  const correct = Math.min(total, Math.max(0, derivedCorrect));
  const accuracy = correct / total;
  const performanceRate = response.fallbackUsed
    ? 0
    : accuracy >= 0.9
      ? 1
      : accuracy >= 0.5
        ? 0.5
        : 0;

  return {
    correct,
    total,
    stars: starsFromAccuracy(performanceRate),
    skillEvidence: evenSkillEvidence(
      skillsAffected(config),
      outcomeFromAccuracy(performanceRate),
    ),
  };
}

export function skillsAffected(config: OralReadingConfig): SkillTag[] {
  return config.skillTag ? [config.skillTag] : [];
}

/** Authored-only kind; structural validation remains defensive for registry parity. */
export function validateGenerated(config: OralReadingConfig): string | null {
  if (config.mode === "sentence") {
    return /[a-z0-9]/i.test(config.passage)
      ? null
      : "passage must contain a word or number";
  }
  return /[a-z0-9]/i.test(config.target) ? null : "target must contain a word or number";
}
