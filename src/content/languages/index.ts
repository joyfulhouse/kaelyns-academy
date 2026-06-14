import type { LanguageDef } from "./types";
import { zhuyin } from "./zhuyin";
import { spanish } from "./spanish";
import { japanese } from "./japanese";
import { korean } from "./korean";

/**
 * The World Languages registry. Each `LanguageDef` is authored, canonical data —
 * the single source of truth for that language's symbols, romanization, and TTS
 * voice. The bounded AI generator draws answers/distractors ONLY from these
 * inventories, and the audio pipeline keys clip ids off `ScriptEntry.id`.
 */
export type { LanguageDef, ScriptEntry, LangMode, VoiceHints } from "./types";
export { audioBaseUrl, audioClipUrl } from "./audio";

/** All languages, keyed by id (== SkillDomain == the program Unit id). */
export const LANGUAGES: Record<LanguageDef["id"], LanguageDef> = {
  zhuyin,
  spanish,
  japanese,
  korean,
};

/** All languages in display order. */
export const LANGUAGE_LIST: LanguageDef[] = [zhuyin, spanish, japanese, korean];

/** Look up a language by id/domain (e.g. "zhuyin"). */
export function getLanguage(id: string): LanguageDef | undefined {
  return (LANGUAGES as Record<string, LanguageDef>)[id];
}

/** Look up a single inventory entry by its stable id (the audio clip key). */
export function getScriptEntry(languageId: string, entryId: string) {
  return getLanguage(languageId)?.inventory.find((e) => e.id === entryId);
}
