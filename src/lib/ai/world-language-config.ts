// server-only: imported only by the practice generator (a server route handler).
// Pure helpers + guards for bounded World-Languages practice generation. No I/O,
// no DB, no LLM call here — this module is safe to import anywhere and is unit
// tested directly. The actual AI call lives in `./practice`.
import {
  langListenMatchConfig,
  langSymbolIntroConfig,
  type ActivityKind,
} from "@/content/activity-configs";
import { getLanguage, type LanguageDef, type ScriptEntry } from "@/content/languages";
import { getSkill } from "@/content/skills";
import type { SkillTag } from "@/content/types";
import type { TutorModel } from "./models";
import { TUTOR_FAST } from "./models";

/** The activity kinds this module governs (the two World-Languages kinds). */
export type LangActivityKind = Extract<ActivityKind, "lang-symbol-intro" | "lang-listen-match">;

/** Type guard: is this a World-Languages activity kind? */
export function isLangKind(kind: ActivityKind): kind is LangActivityKind {
  return kind === "lang-symbol-intro" || kind === "lang-listen-match";
}

/**
 * Cap how many inventory entries we inline into a prompt. Keeps the constraint
 * list focused (and the token budget bounded) while leaving plenty of room for
 * a slice plus distractors. The largest authored group is well under this.
 */
export const INVENTORY_SLICE_CAP = 40;

/**
 * Model routing for language generation. The CJK + Spanish routes stay on the
 * existing default model constant: the answer pool is fully constrained by the
 * inlined inventory and re-checked by `validateLangItems`, so the model only has
 * to *select and copy* glyphs, not author them — `ha-assist` handles that. The
 * `Partial` type leaves a clean seam to slot a stronger multilingual route per
 * language later (e.g. a Claude route on LiteLLM) without touching callers.
 */
export const MODEL_FOR_LANGUAGE: Partial<Record<string, TutorModel>> = {
  zhuyin: TUTOR_FAST,
  spanish: TUTOR_FAST,
  japanese: TUTOR_FAST,
  korean: TUTOR_FAST,
};

/**
 * Age/level framing per language, used to REPLACE the English
 * "end-of-kindergarten / decodable" framing for language generation. Zhuyin is a
 * script-mapping task (she already speaks Mandarin); the rest are absolute
 * beginners in a new language. Kept short — it is concatenated into the prompt.
 */
export const LANGUAGE_LEVELS: Record<string, string> = {
  zhuyin:
    "The child already speaks Mandarin and reads pinyin; this is mapping sounds she knows onto Zhuyin (Bopomofo) symbols, not a new language. Beginning symbol reader.",
  spanish: "An English-speaking young beginner meeting Spanish words for the first time.",
  japanese:
    "An English-speaking young beginner meeting Japanese kana (hiragana/katakana) for the first time.",
  korean: "An English-speaking young beginner meeting Hangul jamo and syllables for the first time.",
};

/** Generic level note when a specific language isn't in the table. */
export const DEFAULT_LANGUAGE_LEVEL =
  "A young beginner (around ages 5 to 7) meeting these symbols for the first time.";

/**
 * Derive the target language from skill hints: the first hint whose skill
 * `domain` is a language id (zhuyin/spanish/japanese/korean) wins. Non-language
 * hints (reading/math/etc.) and unknown slugs are skipped. Returns `undefined`
 * when no hint maps to a language (the caller then falls back to authored
 * content, exactly as a failed generation does today).
 */
export function languageForSkillHints(skillHints: SkillTag[]): LanguageDef | undefined {
  for (const tag of skillHints) {
    const skill = getSkill(tag);
    if (!skill) continue;
    const lang = getLanguage(skill.domain);
    if (lang) return lang;
  }
  return undefined;
}

/** Lowercased keyword tokens (length ≥ 2) drawn from a focus/hint string. */
function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zA-ZÀ-ɏ]+/) // split on non-letters (keep accented latin)
    .filter((w) => w.length >= 2);
}

/**
 * The slice of a language's inventory to constrain generation to. We match
 * entries whose `group` (or, secondarily, romanization/meaning) overlaps a
 * keyword from the focus or skill-hint slugs; if nothing matches we fall back to
 * the whole inventory. Always capped to {@link INVENTORY_SLICE_CAP}.
 *
 * This is the candidate pool the prompt inlines AND the pool a generated glyph
 * is later required to belong to — so a tight, on-topic slice both improves
 * relevance and shrinks the model's room to hallucinate.
 */
export function inventorySlice(
  lang: LanguageDef,
  focus: string,
  skillHints: SkillTag[],
): ScriptEntry[] {
  const hintText = skillHints
    .map((t) => t.replace(/[.\-_]+/g, " ")) // "zhuyin.symbols.initials" -> "zhuyin symbols initials"
    .join(" ");
  const terms = new Set([...keywords(focus), ...keywords(hintText)]);

  let matched: ScriptEntry[] = [];
  if (terms.size > 0) {
    matched = lang.inventory.filter((e) => {
      const haystack = [e.group, e.romanization, e.meaning]
        .filter((s): s is string => Boolean(s))
        .join(" ")
        .toLowerCase();
      for (const term of terms) {
        if (haystack.includes(term)) return true;
      }
      return false;
    });
  }

  // Fall back to the whole inventory when nothing matched (e.g. a generic focus).
  const pool = matched.length > 0 ? matched : lang.inventory;
  return pool.slice(0, INVENTORY_SLICE_CAP);
}

/** Set of Unicode-exact symbols allowed for a language (the whole inventory). */
function allowedSymbols(lang: LanguageDef): Set<string> {
  return new Set(lang.inventory.map((e) => e.symbol));
}

/** Look up the inventory entry whose glyph is exactly `symbol`. */
function entryBySymbol(lang: LanguageDef, symbol: string): ScriptEntry | undefined {
  return lang.inventory.find((e) => e.symbol === symbol);
}

// The two config item shapes, derived from the canonical Zod schemas so this
// guard stays in lockstep with what the schemas actually produce.
type SymbolIntroItem = ReturnType<typeof langSymbolIntroConfig.parse>;
type ListenMatchItem = ReturnType<typeof langListenMatchConfig.parse>;

/**
 * Validation predicate for a lang-symbol-intro item (pure, no mutation): every
 * shown `symbols[].symbol` and every `verify[].choices[]` glyph MUST be a
 * Unicode-exact inventory symbol, and every `verify[].answerIndex` in range.
 */
function keepSymbolIntro(item: SymbolIntroItem, allowed: Set<string>): boolean {
  for (const s of item.symbols) {
    if (!allowed.has(s.symbol)) return false;
  }
  for (const q of item.verify) {
    if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) return false;
    for (const choice of q.choices) {
      if (!allowed.has(choice)) return false;
    }
  }
  return true;
}

/**
 * Validation predicate for a lang-listen-match item (pure): every
 * `items[].choices[]` glyph MUST be a Unicode-exact inventory symbol and
 * `answerIndex` in range.
 */
function keepListenMatch(item: ListenMatchItem, allowed: Set<string>): boolean {
  for (const sub of item.items) {
    if (sub.answerIndex < 0 || sub.answerIndex >= sub.choices.length) return false;
    for (const choice of sub.choices) {
      if (!allowed.has(choice)) return false;
    }
  }
  return true;
}

/**
 * Canonicalize every child-visible and child-HEARD field of a surviving
 * lang-symbol-intro item from the authored inventory. The glyph is the source of
 * truth, so `id`, `romanization`, `spoken` (what TTS says), `audioKey`, and any
 * example/meaning come from the matching `ScriptEntry` — never from the model.
 * This is what stops a real glyph paired with a wrong pronunciation or label from
 * reaching the child.
 */
function canonicalizeSymbolIntro(item: SymbolIntroItem, lang: LanguageDef): void {
  item.locale = lang.locale;
  for (const s of item.symbols) {
    const entry = entryBySymbol(lang, s.symbol);
    if (!entry) continue; // unreachable after keepSymbolIntro; stay safe
    s.id = entry.id;
    s.romanization = entry.romanization;
    s.spoken = entry.spoken;
    s.audioKey = entry.id;
    if (entry.example !== undefined) s.example = entry.example;
    if (entry.exampleSpoken !== undefined) s.exampleSpoken = entry.exampleSpoken;
    if (entry.meaning !== undefined) s.meaning = entry.meaning;
  }
}

/**
 * Canonicalize a surviving lang-listen-match item from the inventory: the played
 * `spoken` + `audioKey` come from the ANSWER glyph's entry (so the child always
 * hears what the answer actually is), and each choice's label is the inventory
 * romanization. None of the heard/labelled content is left to the model.
 */
function canonicalizeListenMatch(item: ListenMatchItem, lang: LanguageDef): void {
  item.locale = lang.locale;
  for (const sub of item.items) {
    const answer = entryBySymbol(lang, sub.choices[sub.answerIndex]);
    if (answer) {
      sub.spoken = answer.spoken;
      sub.audioKey = answer.id;
    }
    sub.choiceLabels = sub.choices.map((c) => entryBySymbol(lang, c)?.romanization ?? "");
  }
}

/**
 * STRICT post-generation guard + canonicalizer. `items` have already passed the
 * per-kind Zod schema (shape is correct); this enforces *linguistic correctness*
 * beyond shape in two stages:
 *   1. REJECT any item where a glyph the child sees or taps is not a Unicode-exact
 *      symbol from the language's authored inventory — the anti-hallucination
 *      check that catches CJK look-alikes and invented glyphs Zod can't ("a
 *      string is a string").
 *   2. CANONICALIZE every child-visible/child-HEARD field of the survivors (id,
 *      romanization, spoken, audioKey, choice labels, locale) from the inventory,
 *      so a real glyph paired with a wrong pronunciation/label never reaches the
 *      child. The model only *selects* glyphs; the facts come from the inventory.
 * Returns ONLY the surviving items; throws if none survive so the caller falls
 * back to authored content.
 */
export function validateLangItems<T>(
  kind: LangActivityKind,
  items: T[],
  lang: LanguageDef,
  _slice: ScriptEntry[],
): T[] {
  const allowed = allowedSymbols(lang);
  const kept: T[] = [];
  for (const item of items) {
    if (kind === "lang-symbol-intro") {
      if (!keepSymbolIntro(item as SymbolIntroItem, allowed)) continue;
      canonicalizeSymbolIntro(item as SymbolIntroItem, lang);
    } else {
      if (!keepListenMatch(item as ListenMatchItem, allowed)) continue;
      canonicalizeListenMatch(item as ListenMatchItem, lang);
    }
    kept.push(item);
  }

  if (kept.length === 0) {
    throw new Error(
      `validateLangItems: no ${kind} item for "${lang.id}" used only inventory glyphs (all rejected as out-of-inventory or out-of-range)`,
    );
  }
  return kept;
}
