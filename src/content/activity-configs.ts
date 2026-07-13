import { z } from "zod";

/**
 * The per-activity-type config contract. Content authors type their activities
 * with the `*Config` (input) types; activity-type Players validate incoming
 * config with the matching schema before render (never trust raw content/AI).
 */

export const phonicsWordbuildConfig = z.object({
  focus: z.string(), // "sh, ch, th digraphs"
  instruction: z.string(), // kid-facing prompt (spoken aloud)
  // Bounded count (.max): every tile is pre-synthesized to durable TTS, so an
  // unbounded array would let one generated config fan out hundreds of warm calls.
  tiles: z.array(z.string().min(1).max(16)).min(2).max(16), // letter / digraph / syllable tiles
  /**
   * Optional per-tile pronunciation override: tile → IPA/misaki phonemes, sent
   * to the neural voice as `[tile](/ipa/)`. A tile is spoken in isolation, where
   * its spelling alone mis-phonemizes (lone "ble" → "blee", "ta" → "tah"); the
   * override makes the child hear the in-word sound. Omit tiles that already
   * voice correctly. See src/lib/audio/phonemes.ts.
   */
  say: z.record(z.string(), z.string().max(48)).optional(),
  /** Tiles voiced as SILENT (no audio) — e.g. the magic-e, which has no sound of
   *  its own. They still fill a build slot; only the spoken sound is suppressed. */
  silent: z.array(z.string().max(16)).max(16).optional(),
  words: z
    .array(
      z.object({
        word: z.string().min(1).max(32),
        picture: z.string().optional(),
        /** Optional whole-word neural-TTS override (IPA), for the rare word the
         *  default G2P gets wrong. Most words need none. */
        ipa: z.string().max(48).optional(),
      }),
    )
    .min(1)
    .max(12),
});
export type PhonicsWordbuildConfig = z.input<typeof phonicsWordbuildConfig>;

export const sightwordGameConfig = z.object({
  instruction: z.string(),
  words: z.array(z.string()).min(2), // the target sight words
  decoys: z.array(z.string()).default([]),
  // Authored skill this game evidences (e.g. word.morphology.prefixes). When
  // omitted the game defaults to reading.decodable (Program-01 behavior).
  skillTag: z.string().min(1).max(64).optional(),
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

// ── Life Skills Math (Adventure 2.0 B1) ──────────────────────────────────────

export const mathClockConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("read"),
    instruction: z.string(),
    hour: z.number().int().min(1).max(12),
    minute: z.union([z.literal(0), z.literal(30)]),
    /** Digital-time choices like "3:00" / "3:30". */
    choices: z.array(z.string().min(1).max(8)).min(2).max(4),
    answerIndex: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("set"),
    instruction: z.string(),
    targetHour: z.number().int().min(1).max(12),
    targetMinute: z.union([z.literal(0), z.literal(30)]),
  }),
]);
export type MathClockConfig = z.input<typeof mathClockConfig>;

const coinEnum = z.enum(["penny", "nickel", "dime", "quarter"]);
export const mathMoneyConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("identify"),
    instruction: z.string(),
    coins: z.array(coinEnum).min(2).max(6),
    targetCoin: coinEnum,
  }),
  z.object({
    mode: z.literal("count"),
    instruction: z.string(),
    /** Coin types the child can tap into the tray. */
    palette: z.array(coinEnum).min(1).max(4),
    targetCents: z.number().int().min(1).max(100),
  }),
]);
export type MathMoneyConfig = z.input<typeof mathMoneyConfig>;

export const mathMeasureConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("compare"),
    instruction: z.string(),
    attribute: z.enum(["length", "height", "weight"]),
    /** "most" → longest/tallest/heaviest; "least" → shortest/…/lightest. */
    question: z.enum(["most", "least"]),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8),
          /** Visual proportion only (renders the bar/size); NOT the answer. */
          size: z.number().min(0).max(100),
        }),
      )
      .min(2)
      .max(4),
    answerIndex: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("units"),
    instruction: z.string(),
    unit: z.enum(["cube", "paperclip", "block", "hand"]),
    /** True length in units (the visual renders this many unit icons). */
    length: z.number().int().min(1).max(12),
    choices: z.array(z.number().int().min(0).max(20)).min(2).max(4),
    answerIndex: z.number().int().min(0),
  }),
]);
export type MathMeasureConfig = z.input<typeof mathMeasureConfig>;

// ── Science & Nature (Adventure 2.0 B2) ──────────────────────────────────────

export const sortCategoriesConfig = z
  .object({
    instruction: z.string(),
    bins: z
      .array(
        z.object({
          id: z.string().min(1).max(24),
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8).optional(),
        }),
      )
      .min(2)
      .max(4),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8).optional(),
          /** Must equal one of `bins[].id`. */
          binId: z.string().min(1).max(24),
        }),
      )
      .min(3)
      .max(8),
  })
  .refine((cfg) => cfg.items.every((it) => cfg.bins.some((b) => b.id === it.binId)), {
    message: "every item.binId must match a bins[].id",
    path: ["items"],
  });
export type SortCategoriesConfig = z.input<typeof sortCategoriesConfig>;

export const seqOrderConfig = z.object({
  instruction: z.string(),
  /** ARRAY ORDER is the correct order (1st … last). 3–6 cards. */
  cards: z
    .array(
      z.object({
        label: z.string().min(1).max(24),
        emoji: z.string().min(1).max(8).optional(),
      }),
    )
    .min(3)
    .max(6),
});
export type SeqOrderConfig = z.input<typeof seqOrderConfig>;

// Authored-only listen-first oral reading: one known word or short phrase.
// Authored activities carry `skillTag` so emitted evidence stays inside the
// activity's `skillTags`; omission is allowed for evidence-free review items.
export const oralReadingConfig = z.object({
  instruction: z.string().trim().min(1).max(200),
  target: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => value.split(/\s+/).length <= 6, "target must be six words or fewer"),
  skillTag: z.string().trim().min(1).max(64).optional(),
});
export type OralReadingConfig = z.input<typeof oralReadingConfig>;

export const ACTIVITY_CONFIG_SCHEMAS = {
  "phonics-wordbuild": phonicsWordbuildConfig,
  "sightword-game": sightwordGameConfig,
  "math-tenframe": mathTenframeConfig,
  "journal-prompt": journalPromptConfig,
  "reading-comprehension": readingComprehensionConfig,
  "math-array": mathArrayConfig,
  "lang-symbol-intro": langSymbolIntroConfig,
  "lang-listen-match": langListenMatchConfig,
  "math-clock": mathClockConfig,
  "math-money": mathMoneyConfig,
  "math-measure": mathMeasureConfig,
  "sort-categories": sortCategoriesConfig,
  "seq-order": seqOrderConfig,
  "oral-reading": oralReadingConfig,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_CONFIG_SCHEMAS;
