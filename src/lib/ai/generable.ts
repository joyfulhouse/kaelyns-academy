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
 * Partial by type, but currently exhaustive: a kind with no entry would be
 * authored-only (spec §9) and {@link isGenerableKind} / `generatePracticeItems`
 * would refuse it. The 5 formerly-authored-only kinds (math-clock/money/measure,
 * sort-categories, seq-order) are now generable (B3): each pairs its brief with a
 * deterministic answer-key validator (`validateGeneratedFor`) run server-side
 * after the zod parse, so an item whose generated answer key is internally
 * inconsistent is dropped before it can reach a child.
 */
export const KIND_BRIEF: Partial<Record<ActivityKind, string>> = {
  "phonics-wordbuild":
    'Build-a-word items. Each: {focus, instruction, tiles:[letters/digraphs], say:{tile:IPA}, words:[{word, picture?}]}. ' +
    "Every target word MUST be spellable from the provided tiles. `picture` is a single emoji. " +
    "Keep words decodable for the focus; 2 to 4 words per item. " +
    "Each tile is tapped and spoken ALONE, so a bare letter mis-reads (lone \"c\" says its name \"see\", \"ble\" says \"blee\"). " +
    "In `say`, map EVERY tile to its IPA SOUND as pronounced INSIDE the word, NOT the letter name (stress mark ˈ optional). " +
    'For "table"=ta+ble use {"ta":"teɪ","ble":"bəl"}; for "cat"=c+a+t use {"c":"k","a":"æ","t":"t"}. ' +
    'The same letter can differ by word: "a" is /æ/ in cat but /eɪ/ in cake; "c" is /k/ in cat but /s/ in city.',
  "sightword-game":
    "Sight-word hunt items. Each: {instruction, words:[real sight words], decoys:[similar-looking non-targets]}. " +
    "Decoys must be plausible but clearly not the target words. 3 to 6 words, 2 to 5 decoys.",
  "math-tenframe":
    'Ten-frame items. Each: {instruction, mode:"represent"|"add", target:0-20, addend?:0-20, frames:1|2}. ' +
    'For "add", include addend and set frames so target+addend fits (≤10 per frame). Numbers age-appropriate.',
  "journal-prompt":
    "Draw-or-compose prompts. Each: {prompt, sentenceStarter?, drawing, mode:'draw'|'compose', frames:[sentence frames], wordBank:[words], allowModes:['scribe'|'type'|'dictate']}. " +
    "For 'compose', supply 1 to 3 sentence frames and a small word bank; the child supplies ideas, not handwriting. Warm, concrete, open-ended.",
  "reading-comprehension":
    'Reading items. Each: {instruction, title?, passage, questions:[{prompt, choices:[2-4 strings], answerIndex, kind:"literal"|"inference"|"main-idea"|"vocabulary"|"author"}], retellPrompt?}. ' +
    "Passage is 3 to 6 short, knowledge-rich sentences at an early-chapter-book level. answerIndex is the 0-based correct choice. 1 to 3 questions.",
  "math-array":
    'Array items. Each: {instruction, mode:"build"|"multiply"|"divide"|"area", rows:1-12, cols:1-12, answer?, emoji?}. ' +
    "answer defaults to rows*cols (the product/area; for divide, rows*cols is the total shared). emoji is one symbol to tile the array. Keep factors friendly.",
  "lang-symbol-intro":
    "Symbol-introduction items. Each: {locale, instruction, skillTags:[...], symbols:[{id, symbol, romanization, spoken, audioKey?, example?, exampleSpoken?, meaning?}], verify:[{prompt, spokenPrompt?, choices:[2-6], answerIndex}]}. " +
    "Introduce 1 to 6 symbols the learner is studying, then 1 to 4 quick checks. Use ONLY symbols from the language's authored inventory; never invent glyphs. `spoken` is the text TTS says; `id` is the inventory id.",
  "lang-listen-match":
    "Listening-discrimination items. Each: {locale, instruction, skillTags:[...], items:[{spoken, audioKey?, choices:[2-6 symbols/words], choiceLabels?:[romanization], answerIndex}]}. " +
    "The child hears `spoken` and taps the matching choice. Every choice and the answer MUST come from the authored inventory. 2 to 8 items.",
  "sort-categories":
    'Sort-into-bins items. Each: {instruction, bins:[{id,label,emoji?}] (2-4), items:[{label,emoji?,binId}] (3-8)}. ' +
    "Every item.binId MUST equal one bins[].id; every bin gets at least one item; bin ids are short lowercase slugs. " +
    "Categories must be observably, factually correct for a 6-year-old (living/nonliving, animal groups, materials, land/water).",
  "seq-order":
    'Put-in-order items. Each: {instruction, cards:[{label,emoji?}] (3-6)}. ARRAY ORDER IS THE ANSWER KEY. ' +
    "ONLY common-knowledge sequences a young child verifies from daily life: counting, size order, daily routine (wake→dress→school→sleep), " +
    "plant growth, simple life cycles. NEVER historical dates, niche facts, or anything debatable. Labels unique.",
  "math-clock":
    'Clock items. Each: {mode:"read", instruction, hour:1-12, minute:0 or 30, choices:["h:mm" strings, 2-4], answerIndex}. ' +
    'choices[answerIndex] MUST be exactly the stated time formatted "H:00" or "H:30"; other choices are plausible near-times; choices unique.',
  "math-money":
    'Coin items. Each: {mode:"identify", instruction, coins:[2-6 of penny|nickel|dime|quarter], targetCoin} — targetCoin MUST appear in coins; ' +
    'or {mode:"count", instruction, palette:[1-4 coin types], targetCents:1-100} — targetCents MUST be payable exactly with the palette coins.',
  "math-measure":
    'Measuring items. Each: {mode:"compare", instruction, attribute:"length"|"height"|"weight", question:"most"|"least", ' +
    "items:[{label,emoji,size:0-100}] (2-4), answerIndex} — items[answerIndex].size MUST be the UNIQUE max (most) or min (least); " +
    'or {mode:"units", instruction, unit:"cube"|"paperclip"|"block"|"hand", length:1-12, choices:[ints,2-4], answerIndex} — choices[answerIndex] MUST equal length.',
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
