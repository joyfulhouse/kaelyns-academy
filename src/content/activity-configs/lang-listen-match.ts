import { z } from "zod";

// World Languages: audio-first discrimination — hear a sound/word, tap the match.
const text = z.string().min(1).max(500);

const listenItem = z
  .object({
    spoken: text,
    audioKey: z.string().min(1).max(160).optional(),
    choices: z.array(z.string().min(1).max(100)).min(2).max(6),
    choiceLabels: z.array(z.string().min(1).max(100)).min(2).max(6).optional(),
    answerIndex: z.number().int().min(0).max(5),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.answerIndex >= item.choices.length) {
      context.addIssue({
        code: "custom",
        message: "answerIndex out of range for choices",
        path: ["answerIndex"],
      });
    }
    if (new Set(item.choices).size !== item.choices.length) {
      context.addIssue({
        code: "custom",
        message: "choices must be unique",
        path: ["choices"],
      });
    }
    if (item.choiceLabels && item.choiceLabels.length !== item.choices.length) {
      context.addIssue({
        code: "custom",
        message: "choiceLabels must match choices length",
        path: ["choiceLabels"],
      });
    }
  });

export const langListenMatchConfig = z
  .object({
    locale: z.string().min(2).max(35),
    instruction: text,
    skillTags: z.array(z.string().min(1).max(120)).min(1).max(8),
    items: z.array(listenItem).min(1).max(12),
  })
  .strict()
  .superRefine((config, context) => {
    if (new Set(config.skillTags).size !== config.skillTags.length) {
      context.addIssue({
        code: "custom",
        message: "skillTags must be unique",
        path: ["skillTags"],
      });
    }
  });
export type LangListenMatchConfig = z.input<typeof langListenMatchConfig>;
