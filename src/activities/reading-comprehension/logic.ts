import {
  readingComprehensionConfig,
  type ReadingComprehensionConfig,
} from "@/content/activity-configs";
import type { ActivityScore, SkillOutcome, SkillTag } from "@/content/types";
import { z } from "zod";
import { outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";
import { isExactEventPermutation } from "./model";

export const schema = readingComprehensionConfig;

const questionResultSchema = z
  .object({
    questionIndex: z.number().int().min(0).max(11),
    choiceIndex: z.number().int().min(0).max(5),
    evidenceSentenceIndex: z.number().int().min(0).max(31).optional(),
    evidenceChoiceIndex: z.number().int().min(0).max(5).optional(),
    attempts: z.number().int().min(1).max(20),
  })
  .strict();

export const responseSchema = z
  .object({
    questionResults: z
      .array(questionResultSchema)
      .max(12)
      .refine(
        (results) => new Set(results.map((result) => result.questionIndex)).size === results.length,
        "question indexes must be unique",
      ),
    retell: z
      .object({
        eventIds: z
          .array(z.string().min(1).max(32).regex(/^[a-z0-9-]+$/))
          .min(2)
          .max(8)
          .refine((eventIds) => new Set(eventIds).size === eventIds.length, "event IDs must be unique"),
        attempts: z.number().int().min(1).max(20),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((response) => response.questionResults.length > 0 || response.retell !== undefined, {
    message: "a response must contain an observed task",
  });
export type ReadingComprehensionResponse = z.infer<typeof responseSchema>;

function assertCompleteValidResponse(
  config: ReadingComprehensionConfig,
  response: ReadingComprehensionResponse,
): void {
  if (response.questionResults.length !== config.questions.length) {
    throw new Error("invalid comprehension response");
  }
  const seen = new Set<number>();
  for (const result of response.questionResults) {
    const question = config.questions[result.questionIndex];
    if (
      !question ||
      seen.has(result.questionIndex) ||
      result.choiceIndex !== question.answerIndex
    ) {
      throw new Error("invalid comprehension response");
    }
    seen.add(result.questionIndex);
    if (question.evidenceSentenceIndexes) {
      if (
        result.evidenceSentenceIndex === undefined ||
        !question.evidenceSentenceIndexes.includes(result.evidenceSentenceIndex) ||
        result.evidenceChoiceIndex !== undefined
      ) {
        throw new Error("invalid comprehension response");
      }
    } else if (question.evidenceChoices) {
      if (
        result.evidenceChoiceIndex !== question.evidenceChoices.answerIndex ||
        result.evidenceSentenceIndex !== undefined
      ) {
        throw new Error("invalid comprehension response");
      }
    } else if (
      result.evidenceSentenceIndex !== undefined ||
      result.evidenceChoiceIndex !== undefined
    ) {
      throw new Error("invalid comprehension response");
    }
  }

  if (config.structuredRetell) {
    const expected = config.structuredRetell.events.map((event) => event.id);
    if (!response.retell || !isExactEventPermutation(expected, response.retell.eventIds)) {
      throw new Error("invalid comprehension response");
    }
  } else if (response.retell) {
    throw new Error("invalid comprehension response");
  }
}

export function skillsAffected(config: ReadingComprehensionConfig): SkillTag[] {
  const skills: SkillTag[] = [];
  const seen = new Set<SkillTag>();
  for (const question of config.questions) {
    if (question.skillTag && !seen.has(question.skillTag)) {
      seen.add(question.skillTag);
      skills.push(question.skillTag);
    }
  }
  if (config.structuredRetell && !seen.has("reading.comprehension.retell")) {
    skills.push("reading.comprehension.retell");
  }
  return skills;
}

export function score(
  config: ReadingComprehensionConfig,
  response: ReadingComprehensionResponse,
): ActivityScore {
  assertCompleteValidResponse(config, response);
  const taskAttempts = response.questionResults.map((result) => result.attempts);
  if (response.retell) taskAttempts.push(response.retell.attempts);
  const total = taskAttempts.length;
  const correct = taskAttempts.filter((attempts) => attempts === 1).length;
  const firstTryRate = total === 0 ? 1 : correct / total;

  return {
    correct,
    total,
    stars: starsFromAccuracy(firstTryRate),
    skillEvidence: evidenceBySkill(config, response),
  };
}

function evidenceBySkill(
  config: ReadingComprehensionConfig,
  response: ReadingComprehensionResponse,
): { skill: SkillTag; outcome: SkillOutcome }[] {
  const attemptsBySkill = new Map<SkillTag, number[]>();
  for (const result of response.questionResults) {
    const skill = config.questions[result.questionIndex]?.skillTag;
    if (!skill) continue;
    const attempts = attemptsBySkill.get(skill) ?? [];
    attempts.push(result.attempts);
    attemptsBySkill.set(skill, attempts);
  }
  if (config.structuredRetell && response.retell) {
    attemptsBySkill.set("reading.comprehension.retell", [response.retell.attempts]);
  }

  return skillsAffected(config).map((skill) => {
    const attempts = attemptsBySkill.get(skill) ?? [];
    const firstTry = attempts.filter((value) => value === 1).length;
    const rate = attempts.length === 0 ? 0 : firstTry / attempts.length;
    return { skill, outcome: outcomeFromAccuracy(rate) };
  });
}

export function validateGenerated(config: ReadingComprehensionConfig): string | null {
  const parsed = schema.safeParse(config);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "invalid comprehension config";
}
