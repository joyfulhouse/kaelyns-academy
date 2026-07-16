// PURE + client-safe: no I/O, no DB, no LLM call, no server-only imports — this
// module is the shared source of truth for "which activity kinds may be
// AI-generated". It is imported by the server generator (`./practice`), the
// server shelf action (`@/lib/tutor/shelf`), AND client components (the
// More-button gate in ActivityHost), so it must stay dependency-free beyond the
// content type. Splitting it out of `./practice` is what keeps `shelf.ts` (and
// thus the kid surface that imports `nextGeneratedPick` from it) off the
// server-only generator.
import type { ActivityKind } from "@/content/activity-configs";

/** The activity kinds the World-Languages generator governs. */
export type LangActivityKind = Extract<ActivityKind, "lang-symbol-intro" | "lang-listen-match">;

/** Type guard: is this a World-Languages activity kind? */
export function isLangKind(kind: ActivityKind): kind is LangActivityKind {
  return kind === "lang-symbol-intro" || kind === "lang-listen-match";
}

/**
 * Plain-language guidance per kind so the model emits the right config shape.
 * Partial by type: a kind with no entry is authored-only (spec §9), and
 * {@link isGenerableKind} / `generatePracticeItems` refuse it. The three
 * grounded life-skills kinds (math-clock/money/measure) pair each brief with a
 * deterministic validator, so an internally inconsistent item is dropped
 * before it can reach a child. Science sorting and sequencing remain
 * authored-only because structural validation cannot prove a model-authored
 * real-world category or event order is factually correct.
 */
export const KIND_BRIEF: Partial<Record<ActivityKind, string>> = {
  "phonics-wordbuild":
    'Build-a-word items. Each: {focus, instruction, skillTag?, tiles:[letters/digraphs], say?:{tile:IPA}, silent?:[silent tiles], words:[{word, picture?, ipa?}]}. ' +
    "Every target word MUST be spellable from the provided tiles. `picture` is a single emoji. " +
    "Keep words decodable for the focus; 2 to 4 words per item. " +
    "Each tile is tapped and spoken ALONE, so a bare letter mis-reads (lone \"c\" says its name \"see\", \"ble\" says \"blee\"). " +
    "In `say`, map EVERY tile to its IPA SOUND as pronounced INSIDE the word, NOT the letter name (stress mark ˈ optional). " +
    'For "table"=ta+ble use {"ta":"teɪ","ble":"bəl"}; for "cat"=c+a+t use {"c":"k","a":"æ","t":"t"}. ' +
    'The same letter can differ by word: "a" is /æ/ in cat but /eɪ/ in cake; "c" is /k/ in cat but /s/ in city. Within one item, a shared tile must keep one pronunciation; put conflicting pronunciations in separate items.',
  "sightword-game":
    "Sight-word hunt items. Each: {instruction, rounds:[{target, choices:[2-6 unique words], context?, spokenPrompt?}] (1-8), skillTag?}. " +
    "Each round's choices MUST contain its target exactly once. Round targets must be unique and cannot appear as another round's distractor.",
  "math-tenframe":
    'Make-a-ten items only. Each: {instruction, mode:"make-ten", target:1-9, addend:1-20, frames:2}. ' +
    "The sum must reach at least 10 and fit the two-frame capacity.",
  "journal-prompt":
    "Draw-or-compose prompts. Each: {prompt, sentenceStarter?, drawing, mode:'draw'|'compose', frames:[sentence frames], wordBank:[words], allowModes:['scribe'|'type'|'dictate']}. " +
    "For 'compose', supply 1 to 3 sentence frames and a small word bank; the child supplies ideas, not handwriting. Warm, concrete, open-ended.",
  "reading-comprehension":
    'Reading items. Each: {instruction, title?, passage, questions:[{prompt, choices:[2-6 strings], answerIndex, kind:"literal"|"inference"|"main-idea"|"vocabulary"|"author"|"text-feature", skillTag?, evidenceSentenceIndexes?:[0-based indexes], evidenceChoices?:{prompt,choices:[2-6 strings],answerIndex}}], retellPrompt?, structuredRetell?:{prompt,events:[{id,text}]}}. ' +
    "Passage is 3 to 6 short, knowledge-rich sentences at an early-chapter-book level. answerIndex is 0-based. " +
    "Only skill-tagged questions emit evidence; inference, vocabulary/context, morphology, and text-feature evidence require an authored bounded clue. " +
    "retellPrompt is an unrecorded invitation and emits no evidence; use structuredRetell with ordered {id,text} events for scored retell evidence.",
  "math-array":
    'Array items. For build/multiply/area: {instruction, mode:"build"|"multiply"|"area", rows:1-12, cols:1-12, emoji?}. ' +
    'For divide: {instruction, mode:"divide", total:1-144, groups:1-12, emoji?}; total MUST divide evenly and each share must be at most 12. ' +
    "Never provide an answer field: products, areas, and equal shares are derived from the operands.",
  "lang-symbol-intro":
    "Symbol-introduction items. Each: {locale, instruction, skillTags:[...], symbols:[{id, symbol, romanization, spoken, audioKey?, example?, exampleSpoken?, meaning?}], verify:[{prompt, spokenPrompt?, choices:[2-6], answerIndex}]}. " +
    "Introduce 3 to 8 symbols from the supplied authored slice, then 1 to 6 quick checks. Use ONLY canonical supplied symbol facts; never invent glyphs or metadata. `spoken` is the text TTS says; `id` is the inventory id. Every generated check needs spokenPrompt.",
  "lang-listen-match":
    "Listening-discrimination items. Each: {locale, instruction, skillTags:[...], items:[{spoken, audioKey?, choices:[2-6 symbols/words], choiceLabels?:[romanization], answerIndex}]}. " +
    "The child hears `spoken` and taps the matching choice. Every choice and the answer MUST come from the authored inventory. 2 to 8 items.",
  "math-clock":
    'Clock items. Each: {mode:"read", instruction, hour:1-12, minute:0 or 30, choices:["h:mm" strings, 2-4], answerIndex}. ' +
    'choices[answerIndex] MUST be exactly the stated time formatted "H:00" or "H:30"; other choices are plausible near-times; choices unique. ' +
    'Or use the direct clock-hand task {mode:"set", instruction, targetHour:1-12, targetMinute:0 or 30}; never add digital choices to set mode.',
  "math-money":
    'Coin items. Each: {mode:"identify", instruction, coins:[2-6 of penny|nickel|dime|quarter], targetCoin} — targetCoin MUST appear in coins; ' +
    'or {mode:"count", instruction, palette:[1-4 coin types], targetCents:1-100} — targetCents MUST be payable exactly with the palette coins.',
  "math-measure":
    'Measuring items. Each: {mode:"compare", instruction, attribute:"length"|"height"|"weight", question:"most"|"least", ' +
    "items:[{label,emoji,size:0-100}] (2-4), answerIndex} — items[answerIndex].size MUST be the UNIQUE max (most) or min (least); weight comparisons use exactly 2 items. " +
    'or {mode:"units", instruction, objectLabel?, unit:"cube"|"paperclip"|"block"|"hand", length:1-12}. ' +
    "Unit tasks are direct placement interactions; never provide choices or answerIndex.",
};

/**
 * Whether `kind` may be AI-generated at all (spec §9 authored-only non-goal).
 * True for the World-Languages kinds (their own inventory-guarded path) and
 * for any kind with a {@link KIND_BRIEF} entry; false otherwise (authored-only).
 * Single source of truth used by `generatePracticeItems`'s refusal, the
 * bounded generator and the durable shelf target picker.
 */
export function isGenerableKind(kind: ActivityKind): boolean {
  return isLangKind(kind) || KIND_BRIEF[kind] !== undefined;
}
