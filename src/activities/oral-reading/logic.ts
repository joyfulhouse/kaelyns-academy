import { oralReadingConfig, type OralReadingConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for oral-reading. No transcript is accepted. */
export const schema = oralReadingConfig;

const oralReadingResult = z.enum(["matched", "unclear", "no-speech"]);
export const responseSchema = z
  .object({
    /** Count of completed verification results. */
    attempts: z.number().int().min(0).max(2),
    /** Child-safe result for each completed verification; never transcript text. */
    results: z.array(oralReadingResult).max(2),
    /** True when verification completed through any forgiving fallback path. */
    fallbackUsed: z.boolean(),
    /** Short-lived server witness returned by the upload route. The learner
     * host extracts it before persistence; it is never trusted as response data. */
    verificationId: z.string().uuid().optional(),
    /** Derived fluency evidence for sentence mode; never a client-timed value. */
    wcpm: z.number().min(0).max(300).optional(),
    /** One child-safe state per authored passage word. */
    perWord: z
      .array(z.object({ state: z.enum(["correct", "unclear"]) }).strict())
      .min(1)
      .max(7)
      .optional(),
    correctCount: z.number().int().min(0).max(7).optional(),
    totalWords: z.number().int().min(1).max(7).optional(),
  })
  .strict();
export type OralReadingResponse = z.infer<typeof responseSchema>;

export function score(config: OralReadingConfig, response: OralReadingResponse): ActivityScore {
  if (response.fallbackUsed) {
    return { correct: 0, total: 0, stars: 1, skillEvidence: [] };
  }
  if (config.mode === "sentence") return scoreSentence(config, response);

  // A persisted witness represents exactly one current server observation.
  // Prior browser results are display-only and cannot influence mastery.
  const matched = response.results.at(-1) === "matched";
  const rate = matched ? 1 : 0;
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
  const performanceRate = accuracy >= 0.9 ? 1 : accuracy >= 0.5 ? 0.5 : 0;

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
