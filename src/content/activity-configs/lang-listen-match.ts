import { z } from "zod";

// World Languages: audio-first discrimination — hear a sound/word, tap the match.
export const langListenMatchConfig = z.object({
  locale: z.string(),
  instruction: z.string(),
  skillTags: z.array(z.string()).min(1),
  items: z
    .array(
      z
        .object({
          spoken: z.string(), // what's played (TTS text)
          audioKey: z.string().optional(),
          choices: z.array(z.string()).min(2).max(6),
          choiceLabels: z.array(z.string()).optional(), // romanization under each choice
          answerIndex: z.number().int().min(0),
        })
        .refine((it) => it.answerIndex < it.choices.length, {
          message: "answerIndex out of range for choices",
          path: ["answerIndex"],
        }),
    )
    .min(1)
    .max(12),
});
export type LangListenMatchConfig = z.input<typeof langListenMatchConfig>;
