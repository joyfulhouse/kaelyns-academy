// server-only: this module must never be imported into a Client Component.
// (the `server-only` package isn't installed; this comment is the guard, and
//  the route that uses it is a server route handler.)
import { z } from "zod";
import {
  ACTIVITY_CONFIG_SCHEMAS,
  type ActivityKind,
} from "@/content/activity-configs";
import { segmentWord } from "@/content/phonics";
import { ensureNarration } from "@/lib/audio/narration";
import { hasConsonant, plausibleOverride, tileAllowsConsonants } from "@/lib/audio/phonemeCheck";
import { phonemize } from "@/lib/audio/phonemize";
import { prewarmTexts } from "@/lib/audio/spokenFields";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { LanguageDef, ScriptEntry } from "@/content/languages";
import type { Band, SkillTag } from "@/content/types";
import { chatJSON, fenceUntrusted, TUTOR_FAST, TUTOR_RICH, type TutorModel } from "./models";
import {
  JSON_ONLY_RULE,
  NO_EM_DASHES_RULE,
  NO_UNSAFE_CONTENT_RULE,
  UNTRUSTED_DATA_RULE,
} from "./prompt-rules";
import {
  DEFAULT_LANGUAGE_LEVEL,
  inventorySlice,
  isLangKind,
  LANGUAGE_LEVELS,
  languageForSkillHints,
  MODEL_FOR_LANGUAGE,
  validateLangItems,
} from "./world-language-config";

/**
 * Bounded AI practice generation (spec §6/§8). The model proposes activity
 * *config* objects for an existing activity-type; we validate every item against
 * the canonical per-kind schema before returning. Anything that fails to parse
 * throws, and the caller falls back to authored content. We never return raw
 * model text, and there is no open-ended child↔LLM channel.
 */

/** Cap generation so a bad prompt can't ask for an unbounded batch. */
const MAX_ITEMS = 8;

/**
 * Plain-language guidance per kind so the model emits the right config shape.
 * Partial, NOT exhaustive: a kind with no entry is authored-only (spec §9) —
 * {@link isGenerableKind} / {@link generatePracticeItems} refuse to generate it.
 * The 3 math-clock/money/measure kinds are deliberately absent: their config
 * schemas defer answerIndex/bounds validation to plugin logic assuming
 * hand-authored, content-validated input, so they must never be AI-generable.
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
};

/**
 * Whether `kind` may be AI-generated at all (spec §9 authored-only non-goal).
 * True for the World-Languages kinds (their own inventory-guarded path) and
 * for any kind with a {@link KIND_BRIEF} entry; false otherwise (authored-only,
 * e.g. math-clock/math-money/math-measure). Single source of truth used by
 * both {@link generatePracticeItems}'s refusal and any caller that wants to
 * offer/accept generation only for generable kinds.
 */
export function isGenerableKind(kind: ActivityKind): boolean {
  return isLangKind(kind) || KIND_BRIEF[kind] !== undefined;
}

const MODEL_FOR_BAND: Record<Band, TutorModel> = {
  ready: TUTOR_FAST,
  stretch: TUTOR_RICH,
};

function buildSystemPrompt(): string {
  return [
    "You generate practice activities for a young child's (ages 5 to 6) learning app.",
    JSON_ONLY_RULE,
    "Content must be gentle, encouraging, decodable, and age-appropriate.",
    NO_UNSAFE_CONTENT_RULE,
    "Instructions are short and spoken aloud, so write them as a friendly grown-up would say them.",
    UNTRUSTED_DATA_RULE,
    NO_EM_DASHES_RULE,
  ].join(" ");
}

function buildUserPrompt(
  kind: ActivityKind,
  band: Band,
  focus: string,
  n: number,
  skillHints: SkillTag[],
  interests: string[] = [],
): string {
  const bandNote =
    band === "stretch"
      ? "Aim slightly above grade level (stretch toward 2nd grade)."
      : "Keep it solidly on grade level for end-of-kindergarten.";
  return [
    `Create ${n} "${kind}" practice item(s) focused on this topic: ${fenceUntrusted(focus)}.`,
    skillHints.length ? `Target skills: ${fenceUntrusted(skillHints.join(", "))}.` : "",
    bandNote,
    interests.length
      ? `Where it fits naturally, theme items around what this child loves: ${fenceUntrusted(interests.slice(0, 5).join(", "))}. Never force a theme onto phonics/letter mechanics.`
      : "",
    KIND_BRIEF[kind],
    `Return JSON exactly as: { "items": [ <item>, ... ] } with ${n} item(s).`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * System prompt for World-Languages generation. Replaces the English
 * "decodable / ages 5-6" framing with a language-teaching framing whose hard
 * rule is: copy glyphs from the provided inventory exactly, never invent them.
 */
function buildLangSystemPrompt(lang: LanguageDef): string {
  const level = LANGUAGE_LEVELS[lang.id] ?? DEFAULT_LANGUAGE_LEVEL;
  return [
    `You generate ${lang.displayName} (${lang.nativeName}) practice for a young child's learning app.`,
    level,
    JSON_ONLY_RULE,
    "CRITICAL: use ONLY the symbols from the provided inventory and copy each glyph EXACTLY, character for character.",
    "Never invent, translate, romanize, or substitute a look-alike glyph; the answer and every choice MUST be a glyph from the list.",
    "Content must be gentle, encouraging, and age-appropriate. Instructions are short and spoken aloud.",
    NO_UNSAFE_CONTENT_RULE,
    UNTRUSTED_DATA_RULE,
    NO_EM_DASHES_RULE,
  ].join(" ");
}

/** Render the inventory slice as a copy-exactly constraint block for the prompt. */
function inventoryLines(slice: ScriptEntry[]): string {
  return slice
    .map((e) => {
      const gloss = e.meaning ? ` = ${e.meaning}` : "";
      return `- id:${e.id}  symbol:${e.symbol}  (${e.romanization})${gloss}`;
    })
    .join("\n");
}

/**
 * User prompt for World-Languages generation: inlines the inventory slice as a
 * hard constraint and pins locale + romanization scheme + skillTags so the
 * emitted config is self-describing and on-inventory.
 */
function buildLangUserPrompt(
  kind: ActivityKind,
  lang: LanguageDef,
  band: Band,
  focus: string,
  n: number,
  skillHints: SkillTag[],
  slice: ScriptEntry[],
): string {
  const bandNote =
    band === "stretch"
      ? "Stretch a little: include a couple more symbols or a slightly harder check."
      : "Keep it gentle and focused on just-introduced symbols.";
  // Fence skillHints (authenticated request input) so they can't escape into
  // instructions; the server-controlled fallback needs no fencing. The raw array
  // still drives language routing / inventory slicing elsewhere — only the
  // prompt-rendered string is fenced.
  const tags = skillHints.length ? fenceUntrusted(skillHints.join(", ")) : `${lang.id}.symbols`;
  return [
    `Create ${n} "${kind}" practice item(s) for ${lang.displayName} focused on this topic: ${fenceUntrusted(focus)}.`,
    `Target skills: ${tags}. Set each item's "skillTags" to these.`,
    `Use locale "${lang.locale}" and romanization scheme "${lang.romanization}".`,
    bandNote,
    KIND_BRIEF[kind],
    "Use ONLY these symbols, and copy them EXACTLY (do not invent or modify glyphs):",
    inventoryLines(slice),
    'The answer and EVERY choice MUST be a "symbol" from this list. Set each emitted symbol\'s "id" to the matching id above.',
    `Return JSON exactly as: { "items": [ <item>, ... ] } with ${n} item(s).`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A function that maps a word to its real phonemes (or null on failure). Injected
 *  so the repair is unit-testable without touching Kokoro. */
export type PhonemizeFn = (text: string) => Promise<string | null>;

/** The phonics-wordbuild fields the repair reads. A loose structural shape so it
 *  accepts both the Zod input and output config objects. */
interface RepairablePhonics {
  tiles: string[];
  say?: Record<string, string>;
  silent?: string[];
  words: { word: string; ipa?: string }[];
}

/** tile → every word in the config that uses it (greedy-segmented the SAME way the
 *  Player segments, so the tile is judged in real contexts). */
function wordsByTile(config: RepairablePhonics): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { word } of config.words) {
    for (const seg of segmentWord(word, config.tiles)) {
      const arr = map.get(seg);
      if (arr) arr.push(word);
      else map.set(seg, [word]);
    }
  }
  return map;
}

/**
 * Validate a GENERATED `config.say` against resolved word phonemes, keeping ONLY
 * the overrides we can positively confirm and dropping all the rest (→ bare).
 * Pure + sync. Fail-CLOSED: this is untrusted model output, so anything we can't
 * check is removed rather than shipped on faith.
 *
 * An override for `tile` is KEPT iff ALL of:
 *  1. some word in the config uses the tile (not an inert/decoy key), AND
 *  2. EVERY word using the tile was successfully phonemized (full ground truth —
 *     a partial outage can't confirm the override for the unseen words), AND
 *  3. the override has ≥1 consonant ({@link hasConsonant}) so it's checkable —
 *     a pure-vowel override can't be validated (vowels vary by word) and is
 *     dropped, leaving the vowel tile to fall back to bare, AND
 *  4. every override consonant is one the TILE's own letters can spell
 *     ({@link tileAllowsConsonants}) — rejects a cross-tile consonant like /t/ on
 *     an "a" tile, or /t/ on a "c" tile, that step 5 alone would miss, AND
 *  5. it's {@link plausibleOverride plausible} for EVERY word using the tile.
 *
 * Why EVERY word (not "any"): the Player applies the one flat `say[tile]` whenever
 * that tile is tapped, REGARDLESS of which word is being built. So an override is
 * only safe if it's correct in every context the tile appears in. A tile that
 * sounds different across the config's words ("c" = /k/ in cat, /s/ in city) can't
 * be represented by one entry, so it's dropped (→ bare in all of them) rather than
 * voiced wrong for one word. This is order-independent and never-worse-than-bare
 * for the consonant. (Non-conflicting shared tiles — same sound everywhere — survive.)
 *
 * Residual ceiling (ACCEPTED known limitation — product decision 2026-06-21):
 * this is a best-effort sanity net, not a proof, because it lacks grapheme→phoneme
 * ALIGNMENT (Kokoro's flat /dev/phonemize returns no per-letter offsets; and
 * phonemizing a tile's letters in isolation is the very out-of-context bug we fix).
 * Two classes therefore slip through, both rare and both never worse than a missing
 * override would be in the average case:
 *   1. VOWEL quality — a kept override's vowel isn't validated (vowels vary by word;
 *      checking them would false-reject), so the LLM's vowel is trusted.
 *   2. CONSONANT position — a consonant the tile CAN spell that also appears
 *      elsewhere in the word passes even if it's not the tile's actual sound (e.g.
 *      soft-c "s" on the "c" tile of "scat", where /s/ comes from the "s" tile).
 * Closing these requires a real G2P aligner — tracked in
 * docs/claude/GENERATED_PHONICS_PRONUNCIATION.md. The pass ONLY ever removes
 * overrides, and authored content is hand-verified and never passes through here.
 */
function applyRepair(config: RepairablePhonics, phonemesByWord: Map<string, string>): void {
  const say = config.say;
  if (!say) return;
  const tileWords = wordsByTile(config);
  for (const tile of Object.keys(say)) {
    const ipa = say[tile]!;
    const words = tileWords.get(tile) ?? [];
    const phonemes = words.map((w) => phonemesByWord.get(w));
    const allGroundTruthed = words.length > 0 && phonemes.every((p) => p != null);
    const validated =
      hasConsonant(ipa) &&
      tileAllowsConsonants(tile, ipa) &&
      allGroundTruthed &&
      phonemes.every((p) => plausibleOverride(ipa, p!));
    if (!validated) delete say[tile]; // fail-closed: keep only overrides correct in EVERY context
  }
}

/** The set of words actually referenced by some `say` tile across all configs —
 *  the only words worth phonemizing. */
function wordsToPhonemize(configs: readonly RepairablePhonics[]): string[] {
  const words = new Set<string>();
  for (const config of configs) {
    if (!config.say) continue;
    const tiles = new Set(Object.keys(config.say));
    for (const [tile, used] of wordsByTile(config)) {
      if (tiles.has(tile)) for (const w of used) words.add(w);
    }
  }
  return [...words];
}

/**
 * Validate the per-tile `say` overrides of a BATCH of generated phonics configs
 * against Kokoro ground truth, dropping hallucinations (→ bare fallback). Mutates
 * each config's `say` in place.
 *
 * Resilience: phonemizes each unique word at most once (deduped across the whole
 * batch) with bounded concurrency, and CIRCUIT-BREAKS — once one call fails/times
 * out it stops calling Kokoro, so a black-holed endpoint costs ~one timeout total,
 * not one per word. Fail-CLOSED: {@link applyRepair} drops any override it can't
 * positively confirm (incl. every override when Kokoro was down for its words), so
 * an unvalidated model guess never reaches the child — it degrades to bare instead.
 */
export async function repairPhonicsBatch(
  configs: readonly RepairablePhonics[],
  phonemizeFn: PhonemizeFn,
): Promise<void> {
  const words = wordsToPhonemize(configs);
  const phonemesByWord = new Map<string, string>();
  let kokoroDown = false;
  await mapWithConcurrency(words, 4, async (word) => {
    if (kokoroDown) return; // circuit open: don't pile on more 10s timeouts
    const p = await phonemizeFn(word);
    if (p == null) kokoroDown = true;
    else phonemesByWord.set(word, p);
  });
  for (const config of configs) applyRepair(config, phonemesByWord);
}

/**
 * Single-config convenience wrapper over {@link repairPhonicsBatch} (mutates and
 * returns `config`). Kept for focused unit tests; the generator uses the batch
 * form so phonemize calls dedupe and circuit-break across all items at once.
 */
export async function repairPhonicsSay<T extends RepairablePhonics>(
  config: T,
  phonemizeFn: PhonemizeFn,
): Promise<T> {
  await repairPhonicsBatch([config], phonemizeFn);
  return config;
}

/**
 * Remove the AI-generated pronunciation controls we CANNOT soundly validate, so
 * generated audio can never drop below bare TTS:
 *  - `silent`: marking a tile silent needs to know a letter is truly unvoiced —
 *    that's the same grapheme→phoneme alignment Kokoro can't give. A bad `silent`
 *    would mute a tile that should sound (worse than bare). Drop it → the tile
 *    falls back to its letter sound.
 *  - per-word `ipa`: a wrong whole-word override would mis-voice the target. Drop
 *    it → the word speaker falls back to bare G2P, which voices WHOLE words
 *    correctly (only isolated fragments mis-read, and those are the `say` tiles).
 * Authored configs keep both (they're hand-verified); this runs on model output only.
 */
function stripUnvalidatedControls(config: RepairablePhonics): void {
  delete config.silent;
  for (const w of config.words) delete w.ipa;
}

/**
 * Make a batch of AI-generated phonics-wordbuild configs safe to voice: validate
 * the per-tile `say` overrides against Kokoro ground truth (drop hallucinations,
 * {@link repairPhonicsBatch}) AND strip the controls we can't validate
 * ({@link stripUnvalidatedControls}). After this, generated phonics audio is never
 * worse than bare TTS — every surviving control is either validated or a correct
 * whole-word fallback. Mutates each config in place.
 */
export async function sanitizeGeneratedPhonics(
  configs: readonly RepairablePhonics[],
  phonemizeFn: PhonemizeFn,
): Promise<void> {
  await repairPhonicsBatch(configs, phonemizeFn);
  for (const config of configs) stripUnvalidatedControls(config);
}

export interface GeneratePracticeOptions {
  /** Optional canonical skill tags to steer generation (e.g. ["phonics.digraphs"]). */
  skillHints?: SkillTag[];
  /**
   * Optional child-picked interest labels (≤5, admin-authored preset text
   * only — §8) to theme generation around, e.g. ["dinosaurs", "space"].
   * Non-language kinds only: World-Languages prompts stay inventory-
   * constrained (see {@link generatePracticeItems}).
   */
  interests?: string[];
  /** Abort signal for request-level timeouts. */
  signal?: AbortSignal;
}

/**
 * Bound metadata describing which model/route produced a generated item (P6 /
 * spec §8 provenance). This is the ONLY thing we persist about generation — never
 * the raw prompt (a prompt can embed the child's display name → PII; plan §3.3).
 */
export interface GenerationProvenance {
  /** The logical tutor route name from models.ts (e.g. "ha-assist"). NOT a raw provider id. */
  model: TutorModel;
  /** Audit tag for the path taken: a language id for lang kinds, else the band. */
  route: string;
}

/**
 * Derive the provenance (model + route) a generation WOULD use, from the same
 * deterministic inputs the generator routes on — `kind`, `band`, and
 * `skillHints`. Kept as a tiny pure mirror of the model selection inside
 * {@link generatePracticeItems} so the provenance recorded on an attempt reflects
 * what actually produced it, derived SERVER-side (not echoed by the client). For
 * a World-Languages kind the route is the resolved language id (and the model its
 * per-language route, falling back to the band model); otherwise the route is the
 * band and the model is the band model.
 */
export function provenanceForGeneration(
  kind: ActivityKind,
  band: Band,
  skillHints: SkillTag[],
): GenerationProvenance {
  if (isLangKind(kind)) {
    const lang = languageForSkillHints(skillHints);
    if (lang) {
      return { model: MODEL_FOR_LANGUAGE[lang.id] ?? MODEL_FOR_BAND[band], route: lang.id };
    }
    // No language resolved → generation itself throws; keep provenance honest.
    return { model: MODEL_FOR_BAND[band], route: band };
  }
  return { model: MODEL_FOR_BAND[band], route: band };
}

/**
 * Generate `n` validated config items for `kind`. The return type is the array
 * of validated configs for that kind. Throws on any validation failure.
 */
export async function generatePracticeItems<K extends ActivityKind>(
  kind: K,
  band: Band,
  focus: string,
  n: number,
  options: GeneratePracticeOptions = {},
): Promise<z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[]> {
  const count = Math.max(1, Math.min(MAX_ITEMS, Math.trunc(n)));
  const skillHints = options.skillHints ?? [];
  const itemSchema = ACTIVITY_CONFIG_SCHEMAS[kind];
  // The model output is validated as a strict envelope of per-kind items.
  const envelope = z.object({ items: z.array(itemSchema).min(1).max(MAX_ITEMS) });

  // World-Languages kinds MUST go through the language + inventory-constrained
  // path. The language is derived from the skill hints; if none names a language
  // we hard-fail rather than fall through to the generic English generator —
  // which would emit schema-valid but inventory-UNGUARDED language content. The
  // route turns the throw into a 502 -> authored-content fallback.
  if (isLangKind(kind)) {
    const lang = languageForSkillHints(skillHints);
    if (!lang) {
      throw new Error(
        `generatePracticeItems: ${kind} needs a language skill hint (e.g. "zhuyin.symbols.initials"); none of [${skillHints.join(", ")}] names a language.`,
      );
    }
    const slice = inventorySlice(lang, focus, skillHints);
    const result = await chatJSON({
      model: MODEL_FOR_LANGUAGE[lang.id] ?? MODEL_FOR_BAND[band],
      system: buildLangSystemPrompt(lang),
      user: buildLangUserPrompt(kind, lang, band, focus, count, skillHints, slice),
      schema: envelope,
      signal: options.signal,
    });
    // Shape is valid (Zod); now enforce + canonicalize linguistic correctness:
    // reject out-of-inventory glyphs, then rebuild child-facing fields from the
    // authored inventory. Throws if none survive.
    const guarded = validateLangItems(kind, result.items, lang, slice);
    return guarded as z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[];
  }

  // Authored-only kind (spec §9): no KIND_BRIEF entry means no vetted prompt
  // contract for this shape, so refuse rather than let the model free-guess a
  // config whose schema deliberately trusts hand-authored bounds/answerIndex.
  // The route turns this throw into a 502 -> authored-content fallback, same
  // as the World-Languages guard above.
  if (KIND_BRIEF[kind] === undefined) {
    throw new Error(`generatePracticeItems: "${kind}" is authored-only (no generation brief)`);
  }

  const result = await chatJSON({
    model: MODEL_FOR_BAND[band],
    system: buildSystemPrompt(),
    user: buildUserPrompt(kind, band, focus, count, skillHints, options.interests ?? []),
    schema: envelope,
    signal: options.signal,
  });

  const items = result.items as z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[];

  // Phonics tiles are spoken in isolation, so the model emits a per-tile IPA `say`
  // override (KIND_BRIEF). The model can hallucinate IPA, so validate each override
  // against the word's REAL phonemes from Kokoro and drop the implausible ones
  // (→ bare fallback, no regression). Awaited so prewarm caches the corrected
  // strings; phonemize is fail-open (Kokoro down ⇒ keep, still sanitized/bounded).
  if (kind === "phonics-wordbuild") {
    // K is generic so the runtime `kind` check can't narrow `items`' type; the
    // runtime shape is a phonics config, structurally a RepairablePhonics. Validate
    // `say` and strip the controls we can't validate so generated audio is never
    // worse than bare TTS (dedupes + circuit-breaks phonemize across all items).
    const phonics = items as unknown as RepairablePhonics[];
    await sanitizeGeneratedPhonics(phonics, phonemize);
  }

  // Fire-and-forget: warm the durable narration cache for everything the child will
  // hear, so the speaker button is an instant hit. Never blocks/breaks the response
  // (ensureNarration swallows its own errors). prewarmTexts dedupes + hard-caps the
  // set; mapWithConcurrency bounds in-flight synths to 4 so one response can't burst
  // many concurrent Kokoro/MinIO ops.
  void mapWithConcurrency(prewarmTexts(items), 4, (text) => ensureNarration(text));
  return items;
}
