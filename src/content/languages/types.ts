/**
 * World Languages — authored canonical reference data contract.
 *
 * A `LanguageDef` holds the linguistic *facts* for one language (its script
 * inventory, romanization, TTS voice hints). This is authored, never AI-derived:
 * the bounded practice generator (`src/lib/ai`) draws answers and distractors
 * ONLY from a language's inventory, and the audio pipeline keys clip ids off it.
 * The model never invents what a symbol is or how it sounds.
 */
import type { SkillDomain } from "../types";

/**
 * Pedagogical mode. Zhuyin = the learner already speaks the language and maps
 * known sounds onto new symbols; the rest = a new language from scratch.
 */
type LangMode = "script-mapping" | "l2-from-scratch";

/** One canonical symbol / word in a language's inventory. */
export interface ScriptEntry {
  /** Stable, opaque id — also the audio clip key (e.g. "zhuyin-b", "hiragana-a", "es-hola"). */
  id: string;
  /** Display glyph(s) in native script (e.g. "ㄅ", "あ", "ㅏ", "Hola"). */
  symbol: string;
  /** Romanization a beginning reader can lean on (pinyin / romaji / RR / phonetic). */
  romanization: string;
  /** Text handed to TTS when no recorded clip exists — usually a syllable or word. */
  spoken: string;
  /**
   * Override text for a NEURAL TTS (Kokoro) when `spoken` isn't suitable for it.
   * Zhuyin's `spoken` is Bopomofo, which Kokoro can't read, so `tts` holds a
   * Mandarin hanzi of the same sound. The pre-generation script prefers this; the
   * in-browser TTS fallback still speaks `spoken`.
   */
  tts?: string;
  /** Tone (Mandarin/Zhuyin only): 1–4, or 5 = neutral. */
  tone?: 1 | 2 | 3 | 4 | 5;
  /** Display grouping (e.g. "initials", "vowels", "row-a", "greetings"). */
  group?: string;
  /** A concrete example using this symbol (display). */
  example?: string;
  /** How to say the example aloud. */
  exampleSpoken?: string;
  /** English gloss of the symbol/word or its example. */
  meaning?: string;
}

/** TTS voice preference hints for the browser Speech API. */
interface VoiceHints {
  /** BCP-47 tag set on `SpeechSynthesisUtterance.lang`. */
  lang: string;
  /** Preferred installed-voice name substrings, in priority order. */
  preferredVoiceNames?: string[];
  /** Speaking rate (0.5–2.0); tonal/CJK languages read a touch slower. */
  rate?: number;
}

/** A language available in the World Languages program. */
export interface LanguageDef {
  /** Stable id; equals the program Unit id and the SkillDomain for this language. */
  id: Extract<SkillDomain, "zhuyin" | "spanish" | "japanese" | "korean">;
  /** BCP-47 locale for TTS + the audio clip path. */
  locale: string;
  /** English display name. */
  displayName: string;
  /** Name in the language itself. */
  nativeName: string;
  /** Flag / motif emoji for the unit. */
  emoji: string;
  /** Teaching mode (drives the scaffolding). */
  mode: LangMode;
  /** Romanization scheme label (shown in UI tooltips and used in AI prompts). */
  romanization: "pinyin" | "romaji" | "revised-romanization" | "ipa-phonics";
  /** TTS voice hints for the browser Speech API. */
  voice: VoiceHints;
  /** The authored canonical inventory — the ONLY source of truth for symbols. */
  inventory: ScriptEntry[];
}
