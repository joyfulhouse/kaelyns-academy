import {
  readingComprehensionConfig,
  type ReadingComprehensionConfig,
} from "@/content/activity-configs";
import type { ActivityScore, SkillOutcome, SkillTag } from "@/content/types";
import { outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for reading-comprehension. No "use client". */
export const schema = readingComprehensionConfig;

/** A single question's kind (literal recall, inference, etc.). */
type QuestionKind = ReadingComprehensionConfig["questions"][number]["kind"];

/**
 * What the child did: per-question, whether they got it on the first tap, plus
 * whether they reached the retell moment. The retell is a "say it out loud"
 * affordance, never graded, so it carries no correctness.
 */
export interface ReadingComprehensionResponse {
  /** One entry per question, in order: true when answered correctly first try. */
  firstTry: boolean[];
  /** Whether the child opened the optional retell moment (presence, not quality). */
  retold: boolean;
}

/**
 * Each question kind exercises a different reading muscle, mapped to the
 * canonical Program 02 reading rubric (src/content/skills.ts). Literal recall
 * is the retell/story-elements rung; word-meaning is vocabulary-in-context.
 */
const KIND_SKILL: Record<NonNullable<QuestionKind>, SkillTag> = {
  literal: "reading.comprehension.retell",
  inference: "reading.comprehension.inference",
  "main-idea": "reading.comprehension.main-idea",
  vocabulary: "reading.vocabulary.context",
  author: "reading.comprehension.author-craft",
};

/** The reading skills this passage exercises, de-duplicated, source order. */
export function skillsAffected(config: ReadingComprehensionConfig): SkillTag[] {
  const seen = new Set<SkillTag>();
  const tags: SkillTag[] = [];
  for (const question of config.questions) {
    const kind = question.kind ?? "literal";
    const tag = KIND_SKILL[kind];
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Comprehension is the one place the kid surface measures understanding, but it
 * is still forgiving: every question is answered correctly before advancing, so
 * "correct" counts first-try successes and stars reflect independence (how much
 * of the passage they understood without a second look). Showing up earns 1★.
 */
export function score(
  config: ReadingComprehensionConfig,
  response: ReadingComprehensionResponse,
): ActivityScore {
  const total = config.questions.length;
  const correct = response.firstTry.filter(Boolean).length;
  const firstTryRate = total === 0 ? 1 : correct / total;

  // Per-skill outcome reflects the first-try rate on questions of that kind.
  const skillEvidence = perKindEvidence(config, response);

  return {
    correct,
    total,
    stars: starsFromAccuracy(firstTryRate),
    skillEvidence,
  };
}

/** First-try rate per question kind → outcome, so the tutor sees which reading
 *  muscle is solid vs emerging rather than one blended number. */
function perKindEvidence(
  config: ReadingComprehensionConfig,
  response: ReadingComprehensionResponse,
): { skill: SkillTag; outcome: SkillOutcome }[] {
  const hits = new Map<SkillTag, { correct: number; total: number }>();
  config.questions.forEach((question, index) => {
    const tag = KIND_SKILL[question.kind ?? "literal"];
    const bucket = hits.get(tag) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (response.firstTry[index]) bucket.correct += 1;
    hits.set(tag, bucket);
  });

  const evidence: { skill: SkillTag; outcome: SkillOutcome }[] = [];
  // Preserve source order via skillsAffected.
  for (const tag of skillsAffected(config)) {
    const bucket = hits.get(tag) ?? { correct: 0, total: 1 };
    const rate = bucket.total === 0 ? 1 : bucket.correct / bucket.total;
    evidence.push({ skill: tag, outcome: outcomeFromAccuracy(rate) });
  }
  return evidence;
}
