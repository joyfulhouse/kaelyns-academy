import { mathClockConfig, type MathClockConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for math-clock. No "use client". */
export const schema = mathClockConfig;

/** The child's final action + how many checks it took (≥1). */
const clockAttempts = z.number().int().min(1).max(100);
export const responseSchema = z.union([
  z
    .object({
      attempts: clockAttempts,
      /** read mode: the digital-time choice index the child tapped. */
      selectedIndex: z.number().int().min(0).max(3),
    })
    .strict(),
  z
    .object({
      attempts: clockAttempts,
      /** set mode: the clock the child made. */
      setHour: z.number().int().min(1).max(12),
      setMinute: z.union([z.literal(0), z.literal(30)]),
    })
    .strict(),
]);
export type MathClockResponse = z.infer<typeof responseSchema>;

export function isCorrect(config: MathClockConfig, response: MathClockResponse): boolean {
  if (config.mode === "read") {
    return "selectedIndex" in response && response.selectedIndex === config.answerIndex;
  }
  return (
    "setHour" in response &&
    response.setHour === config.targetHour &&
    response.setMinute === config.targetMinute
  );
}

export function score(config: MathClockConfig, response: MathClockResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** read or set → always the clock/time skill. */
export function skillsAffected(_config: MathClockConfig): SkillTag[] {
  return ["math.time"];
}

/** B3 §6: the marked choice must render the stated time; choices unique. */
export function validateGenerated(config: MathClockConfig): string | null {
  if (config.mode === "set") return null; // no answer key beyond the schema
  if (config.answerIndex >= config.choices.length) return "answerIndex out of range";
  if (new Set(config.choices).size !== config.choices.length) return "duplicate choices";
  const want = `${config.hour}:${config.minute === 0 ? "00" : "30"}`;
  return config.choices[config.answerIndex] === want
    ? null
    : `answer choice "${config.choices[config.answerIndex]}" is not ${want}`;
}
