import { z } from "zod";

/**
 * The per-activity-type config contract. Content authors type their activities
 * with the `*Config` (input) types; activity-type Players validate incoming
 * config with the matching schema before render (never trust raw content/AI).
 */

export const phonicsWordbuildConfig = z.object({
  focus: z.string(), // "sh, ch, th digraphs"
  instruction: z.string(), // kid-facing prompt (spoken aloud)
  tiles: z.array(z.string()).min(2), // letter / digraph / syllable tiles to drag
  /**
   * Optional per-tile pronunciation override: tile → IPA/misaki phonemes, sent
   * to the neural voice as `[tile](/ipa/)`. A tile is spoken in isolation, where
   * its spelling alone mis-phonemizes (lone "ble" → "blee", "ta" → "tah"); the
   * override makes the child hear the in-word sound. Omit tiles that already
   * voice correctly. See src/lib/audio/phonemes.ts.
   */
  say: z.record(z.string(), z.string()).optional(),
  /** Tiles voiced as SILENT (no audio) — e.g. the magic-e, which has no sound of
   *  its own. They still fill a build slot; only the spoken sound is suppressed. */
  silent: z.array(z.string()).optional(),
  words: z
    .array(
      z.object({
        word: z.string(),
        picture: z.string().optional(),
        /** Optional whole-word neural-TTS override (IPA), for the rare word the
         *  default G2P gets wrong. Most words need none. */
        ipa: z.string().optional(),
      }),
    )
    .min(1),
});
export type PhonicsWordbuildConfig = z.input<typeof phonicsWordbuildConfig>;

export const sightwordGameConfig = z.object({
  instruction: z.string(),
  words: z.array(z.string()).min(2), // the target sight words
  decoys: z.array(z.string()).default([]),
});
export type SightwordGameConfig = z.input<typeof sightwordGameConfig>;

export const mathTenframeConfig = z.object({
  instruction: z.string(),
  mode: z.enum(["represent", "add"]),
  target: z.number().int().min(0).max(20),
  addend: z.number().int().min(0).max(20).optional(),
  frames: z.union([z.literal(1), z.literal(2)]).default(1),
});
export type MathTenframeConfig = z.input<typeof mathTenframeConfig>;

export const journalPromptConfig = z.object({
  prompt: z.string(),
  sentenceStarter: z.string().optional(),
  drawing: z.boolean().default(true),
  // Writing-bridge (Program 02): compose at thinking-level without a transcription tax.
  mode: z.enum(["draw", "compose"]).default("draw"),
  frames: z.array(z.string()).default([]), // sentence frames, e.g. "The ___ erupted because ___."
  wordBank: z.array(z.string()).default([]),
  allowModes: z.array(z.enum(["scribe", "type", "dictate"])).default(["type"]),
});
export type JournalPromptConfig = z.input<typeof journalPromptConfig>;

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

// Math array: a rows x cols grid for multiplication, division (sharing), and area.
export const mathArrayConfig = z.object({
  instruction: z.string(),
  mode: z.enum(["build", "multiply", "divide", "area"]),
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(12),
  answer: z.number().int().optional(), // product / quotient / area; defaults to rows*cols when omitted
  emoji: z.string().optional(), // object to tile the array with (🚀 🐳 🍪)
});
export type MathArrayConfig = z.input<typeof mathArrayConfig>;

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

export const ACTIVITY_CONFIG_SCHEMAS = {
  "phonics-wordbuild": phonicsWordbuildConfig,
  "sightword-game": sightwordGameConfig,
  "math-tenframe": mathTenframeConfig,
  "journal-prompt": journalPromptConfig,
  "reading-comprehension": readingComprehensionConfig,
  "math-array": mathArrayConfig,
  "lang-symbol-intro": langSymbolIntroConfig,
  "lang-listen-match": langListenMatchConfig,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_CONFIG_SCHEMAS;
