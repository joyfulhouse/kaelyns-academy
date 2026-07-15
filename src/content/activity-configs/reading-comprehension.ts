import { z } from "zod";

// Reading comprehension: a short leveled passage + tap-the-answer questions + optional retell.
export const readingComprehensionConfig = z.object({
  instruction: z.string(),
  title: z.string().optional(),
  passage: z.string(),
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        choices: z.array(z.string()).min(2),
        answerIndex: z.number().int().min(0),
        kind: z
          .enum(["literal", "inference", "main-idea", "vocabulary", "author"])
          .default("literal"),
      }),
    )
    .min(1),
  retellPrompt: z.string().optional(),
});
export type ReadingComprehensionConfig = z.input<typeof readingComprehensionConfig>;
