import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const questionKind = z.enum([
  "literal",
  "inference",
  "main-idea",
  "vocabulary",
  "author",
  "text-feature",
]);

const evidenceChoicesSchema = z
  .object({
    prompt: boundedText(240),
    choices: z.array(boundedText(240)).min(2).max(6),
    answerIndex: z.number().int().min(0).max(5),
  })
  .strict();

const questionSchema = z
  .object({
    prompt: boundedText(300),
    choices: z.array(boundedText(300)).min(2).max(6),
    answerIndex: z.number().int().min(0).max(5),
    kind: questionKind.default("literal"),
    /** Evidence is opt-in and must also be an authored activity skill tag. */
    skillTag: boundedText(128).optional(),
    /** Any listed passage sentence is accepted as direct textual support. */
    evidenceSentenceIndexes: z.array(z.number().int().min(0).max(31)).min(1).max(8).optional(),
    /** Used when the support is a bounded authored clue rather than one sentence. */
    evidenceChoices: evidenceChoicesSchema.optional(),
  })
  .strict();

const structuredRetellSchema = z
  .object({
    prompt: boundedText(300),
    events: z
      .array(
        z
          .object({
            id: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/),
            text: boundedText(300),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  })
  .strict();

interface ConsistencyConfig {
  passage: string;
  questions: readonly {
    prompt?: string;
    choices: readonly string[];
    answerIndex: number;
    kind?: z.infer<typeof questionKind>;
    skillTag?: string;
    evidenceSentenceIndexes?: readonly number[];
    evidenceChoices?: { choices: readonly string[]; answerIndex: number };
  }[];
  structuredRetell?: { prompt?: string; events: readonly { id: string; text?: string }[] };
}

function normalized(value: string): string {
  return value.toLocaleLowerCase();
}

export function splitComprehensionPassage(passage: string): string[] {
  const sentences: string[] = [];
  for (const rawLine of passage.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const protectedLine = line.replace(/([!?])(["”])(?=\s+[a-z])/g, (_, mark: string, quote: string) =>
      `${mark === "!" ? "\uE000" : "\uE001"}${quote}`,
    );
    const parts = protectedLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    for (const part of parts) {
      const sentence = part.replaceAll("\uE000", "!").replaceAll("\uE001", "?").trim();
      if (sentence) sentences.push(sentence);
    }
  }
  return sentences;
}

function requiresAuthoredEvidence(skillTag: string): boolean {
  return (
    skillTag === "reading.comprehension.inference" ||
    skillTag === "reading.vocabulary.context" ||
    skillTag === "reading.nonfiction.text-features" ||
    skillTag.startsWith("word.morphology.") ||
    skillTag.startsWith("vocab.")
  );
}

function kindMatchesSkill(kind: z.infer<typeof questionKind> | undefined, skillTag: string): boolean {
  if (skillTag === "reading.comprehension.inference") return kind === "inference";
  if (skillTag === "reading.comprehension.main-idea") return kind === "main-idea";
  if (skillTag === "reading.comprehension.author-craft") return kind === "author";
  if (skillTag === "reading.nonfiction.text-features") return kind === "text-feature";
  if (
    skillTag === "reading.vocabulary.context" ||
    skillTag.startsWith("word.morphology.") ||
    skillTag.startsWith("vocab.")
  ) {
    return kind === "vocabulary";
  }
  return kind !== "literal";
}

/** Shared authored/generated cross-field consistency validation. */
export function validateReadingComprehensionConfig(config: ConsistencyConfig): string | null {
  if (config.questions.length === 0 && !config.structuredRetell) {
    return "at least one question or structured retell is required";
  }
  const sentenceCount = splitComprehensionPassage(config.passage).length;
  for (const [questionIndex, question] of config.questions.entries()) {
    const choices = question.choices.map(normalized);
    if (new Set(choices).size !== choices.length) return `question ${questionIndex} choices must be unique`;
    if (question.answerIndex >= question.choices.length) return `question ${questionIndex} answer index is out of range`;
    if (question.evidenceSentenceIndexes && question.evidenceChoices) {
      return `question ${questionIndex} must use one evidence mode`;
    }
    if (question.evidenceSentenceIndexes) {
      if (new Set(question.evidenceSentenceIndexes).size !== question.evidenceSentenceIndexes.length) {
        return `question ${questionIndex} evidence sentence indexes must be unique`;
      }
      if (question.evidenceSentenceIndexes.some((index) => index >= sentenceCount)) {
        return `question ${questionIndex} evidence sentence index is outside the passage`;
      }
    }
    if (question.evidenceChoices) {
      const evidence = question.evidenceChoices;
      const evidenceChoices = evidence.choices.map(normalized);
      if (new Set(evidenceChoices).size !== evidenceChoices.length) {
        return `question ${questionIndex} evidence choices must be unique`;
      }
      if (evidence.answerIndex >= evidence.choices.length) {
        return `question ${questionIndex} evidence answer index is out of range`;
      }
    }
    if (question.skillTag) {
      if (
        question.skillTag === "reading.comprehension.retell" ||
        question.skillTag.startsWith("reading.fluency.") ||
        question.skillTag.startsWith("writing.") ||
        question.skillTag.startsWith("word.syllables.")
      ) {
        return `question ${questionIndex} cannot emit ${question.skillTag}`;
      }
      if (!kindMatchesSkill(question.kind, question.skillTag)) {
        return `question ${questionIndex} kind does not match ${question.skillTag}`;
      }
      if (
        requiresAuthoredEvidence(question.skillTag) &&
        !question.evidenceSentenceIndexes &&
        !question.evidenceChoices
      ) {
        return `question ${questionIndex} needs authored evidence for ${question.skillTag}`;
      }
    }
  }
  const eventIds = config.structuredRetell?.events.map((event) => event.id) ?? [];
  if (new Set(eventIds).size !== eventIds.length) return "structured retell event IDs must be unique";
  return null;
}

export const readingComprehensionConfig = z
  .object({
    instruction: boundedText(300),
    title: boundedText(160).optional(),
    passage: boundedText(4_000),
    questions: z.array(questionSchema).max(12),
    /** Unrecorded speaking invitation. It never emits evidence. */
    retellPrompt: boundedText(300).optional(),
    structuredRetell: structuredRetellSchema.optional(),
  })
  .strict()
  .superRefine((config, context) => {
    const reason = validateReadingComprehensionConfig(config);
    if (reason) context.addIssue({ code: "custom", message: reason });
  });
export type ReadingComprehensionConfig = z.input<typeof readingComprehensionConfig>;
