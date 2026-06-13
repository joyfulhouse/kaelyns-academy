import { z } from "zod";

/**
 * The per-activity-type config contract. Content authors type their activities
 * with the `*Config` (input) types; activity-type Players validate incoming
 * config with the matching schema before render (never trust raw content/AI).
 */

export const phonicsWordbuildConfig = z.object({
  focus: z.string(), // "sh, ch, th digraphs"
  instruction: z.string(), // kid-facing prompt (spoken aloud)
  tiles: z.array(z.string()).min(2), // letter / digraph tiles to drag
  words: z.array(z.object({ word: z.string(), picture: z.string().optional() })).min(1),
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

export const ACTIVITY_CONFIG_SCHEMAS = {
  "phonics-wordbuild": phonicsWordbuildConfig,
  "sightword-game": sightwordGameConfig,
  "math-tenframe": mathTenframeConfig,
  "journal-prompt": journalPromptConfig,
  "reading-comprehension": readingComprehensionConfig,
  "math-array": mathArrayConfig,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_CONFIG_SCHEMAS;
