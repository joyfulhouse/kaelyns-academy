// server-only: this module must never be imported into a Client Component.
// (the `server-only` package isn't installed; this comment is the guard, and
//  the route that uses it is a server route handler.)
import { z } from "zod";
import {
  ACTIVITY_CONFIG_SCHEMAS,
  type ActivityKind,
} from "@/content/activity-configs";
import type { Band, SkillTag } from "@/content/types";
import { chatJSON, TUTOR_FAST, TUTOR_RICH, type TutorModel } from "./models";

/**
 * Bounded AI practice generation (spec §6/§8). The model proposes activity
 * *config* objects for an existing activity-type; we validate every item against
 * the canonical per-kind schema before returning. Anything that fails to parse
 * throws, and the caller falls back to authored content. We never return raw
 * model text, and there is no open-ended child↔LLM channel.
 */

/** Cap generation so a bad prompt can't ask for an unbounded batch. */
const MAX_ITEMS = 8;

/** Plain-language guidance per kind so the model emits the right config shape. */
const KIND_BRIEF: Record<ActivityKind, string> = {
  "phonics-wordbuild":
    'Build-a-word items. Each: {focus, instruction, tiles:[letters/digraphs], words:[{word, picture?}]}. ' +
    "Every target word MUST be spellable from the provided tiles. `picture` is a single emoji. " +
    "Keep words decodable for the focus; 2 to 4 words per item.",
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
};

const MODEL_FOR_BAND: Record<Band, TutorModel> = {
  ready: TUTOR_FAST,
  stretch: TUTOR_RICH,
};

function buildSystemPrompt(): string {
  return [
    "You generate practice activities for a young child's (ages 5 to 6) learning app.",
    "You return ONLY a JSON object of the exact shape requested. No prose, no markdown.",
    "Content must be gentle, encouraging, decodable, and age-appropriate.",
    "Never include anything scary, violent, commercial, or that asks the child for personal information.",
    "Instructions are short and spoken aloud, so write them as a friendly grown-up would say them.",
    "Do not use em dashes.",
  ].join(" ");
}

function buildUserPrompt(
  kind: ActivityKind,
  band: Band,
  focus: string,
  n: number,
  skillHints: SkillTag[],
): string {
  const bandNote =
    band === "stretch"
      ? "Aim slightly above grade level (stretch toward 2nd grade)."
      : "Keep it solidly on grade level for end-of-kindergarten.";
  return [
    `Create ${n} "${kind}" practice item(s) focused on: ${focus}.`,
    skillHints.length ? `Target skills: ${skillHints.join(", ")}.` : "",
    bandNote,
    KIND_BRIEF[kind],
    `Return JSON exactly as: { "items": [ <item>, ... ] } with ${n} item(s).`,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface GeneratePracticeOptions {
  /** Optional canonical skill tags to steer generation (e.g. ["phonics.digraphs"]). */
  skillHints?: SkillTag[];
  /** Abort signal for request-level timeouts. */
  signal?: AbortSignal;
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
  const itemSchema = ACTIVITY_CONFIG_SCHEMAS[kind];
  // The model output is validated as a strict envelope of per-kind items.
  const envelope = z.object({ items: z.array(itemSchema).min(1).max(MAX_ITEMS) });

  const result = await chatJSON({
    model: MODEL_FOR_BAND[band],
    system: buildSystemPrompt(),
    user: buildUserPrompt(kind, band, focus, count, options.skillHints ?? []),
    schema: envelope,
    signal: options.signal,
  });

  return result.items as z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[];
}
