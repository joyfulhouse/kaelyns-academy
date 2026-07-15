import { z } from "zod";

// World Languages: introduce new symbols (see + hear), then a quick verify.
// `skillTags` ride on the config so AI-generated items are self-describing and
// emit the right mastery evidence. Symbols carry an `id` (= audio clip key) and
// the linguistic facts come from the authored inventory (src/content/languages).
export const langSymbolIntroConfig = z.object({
  locale: z.string(), // BCP-47, e.g. "zh-TW", "es-MX", "ja-JP", "ko-KR"
  instruction: z.string(),
  skillTags: z.array(z.string()).min(1),
  symbols: z
    .array(
      z.object({
        id: z.string(), // stable inventory id (also the audio clip key)
        symbol: z.string(), // glyph(s) shown
        romanization: z.string(),
        spoken: z.string(), // TTS text when no recorded clip exists
        audioKey: z.string().optional(),
        example: z.string().optional(),
        exampleSpoken: z.string().optional(),
        meaning: z.string().optional(),
      }),
    )
    .min(1)
    .max(8),
  verify: z
    .array(
      z
        .object({
          prompt: z.string(),
          spokenPrompt: z.string().optional(),
          choices: z.array(z.string()).min(2).max(6),
          answerIndex: z.number().int().min(0),
        })
        .refine((q) => q.answerIndex < q.choices.length, {
          message: "answerIndex out of range for choices",
          path: ["answerIndex"],
        }),
    )
    .min(1)
    .max(6),
});
export type LangSymbolIntroConfig = z.input<typeof langSymbolIntroConfig>;
