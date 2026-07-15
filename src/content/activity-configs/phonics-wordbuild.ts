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
