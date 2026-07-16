import { z } from "zod";

const text = z.string().min(1).max(500);

const symbol = z
  .object({
    id: z.string().min(1).max(160),
    symbol: z.string().min(1).max(100),
    romanization: z.string().min(1).max(100),
    spoken: text,
    audioKey: z.string().min(1).max(160).optional(),
    example: z.string().min(1).max(240).optional(),
    exampleSpoken: z.string().min(1).max(240).optional(),
    meaning: z.string().min(1).max(240).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.exampleSpoken && !entry.example) {
      context.addIssue({
        code: "custom",
        message: "exampleSpoken requires a visible example",
        path: ["exampleSpoken"],
      });
    }
  });

const verification = z
  .object({
    prompt: text,
    // Remains optional at the shape layer until centralized generation prompts
    // migrate; the plugin-local generated validator requires it before use.
    spokenPrompt: text.optional(),
    choices: z.array(z.string().min(1).max(100)).min(2).max(6),
    answerIndex: z.number().int().min(0).max(5),
  })
  .strict()
  .superRefine((check, context) => {
    if (check.answerIndex >= check.choices.length) {
      context.addIssue({
        code: "custom",
        message: "answerIndex out of range for choices",
        path: ["answerIndex"],
      });
    }
    if (new Set(check.choices).size !== check.choices.length) {
      context.addIssue({
        code: "custom",
        message: "verification choices must be unique",
        path: ["choices"],
      });
    }
  });

export const langSymbolIntroConfig = z
  .object({
    locale: z.string().min(2).max(35),
    instruction: text,
    skillTags: z.array(z.string().min(1).max(120)).min(1).max(8),
    symbols: z.array(symbol).min(3).max(8),
    verify: z.array(verification).min(1).max(6),
  })
  .strict()
  .superRefine((config, context) => {
    const ids = config.symbols.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "symbol ids must be unique", path: ["symbols"] });
    }

    const taught = config.symbols.map((entry) => entry.symbol);
    if (new Set(taught).size !== taught.length) {
      context.addIssue({
        code: "custom",
        message: "taught symbols must be unique",
        path: ["symbols"],
      });
    }
    const taughtSet = new Set(taught);
    config.verify.forEach((check, checkIndex) => {
      check.choices.forEach((choice, choiceIndex) => {
        if (!taughtSet.has(choice)) {
          context.addIssue({
            code: "custom",
            message: "verification choices must come from taught symbols",
            path: ["verify", checkIndex, "choices", choiceIndex],
          });
        }
      });
    });

    if (new Set(config.skillTags).size !== config.skillTags.length) {
      context.addIssue({
        code: "custom",
        message: "skillTags must be unique",
        path: ["skillTags"],
      });
    }
  });

export type LangSymbolIntroConfig = z.input<typeof langSymbolIntroConfig>;
