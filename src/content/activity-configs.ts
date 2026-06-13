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
});
export type JournalPromptConfig = z.input<typeof journalPromptConfig>;

export const ACTIVITY_CONFIG_SCHEMAS = {
  "phonics-wordbuild": phonicsWordbuildConfig,
  "sightword-game": sightwordGameConfig,
  "math-tenframe": mathTenframeConfig,
  "journal-prompt": journalPromptConfig,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_CONFIG_SCHEMAS;
