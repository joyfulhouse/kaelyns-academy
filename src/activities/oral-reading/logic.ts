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
}

export function score(config: OralReadingConfig, response: OralReadingResponse): ActivityScore {
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

export function skillsAffected(config: OralReadingConfig): SkillTag[] {
  return config.skillTag ? [config.skillTag] : [];
}

/** Authored-only kind; structural validation remains defensive for registry parity. */
export function validateGenerated(config: OralReadingConfig): string | null {
  return /[a-z0-9]/i.test(config.target) ? null : "target must contain a word or number";
}
