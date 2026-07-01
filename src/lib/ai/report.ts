// server-only: this module must never be imported into a Client Component.
// (the `server-only` package isn't installed; this comment is the guard, and
//  the server action that uses it runs only on the server.)
import { z } from "zod";
import type { SkillOutcome } from "@/content";
import { chatJSON, fenceUntrusted, TUTOR_RICH } from "./models";
import { JSON_ONLY_RULE, NO_EM_DASHES_RULE, UNTRUSTED_DATA_RULE } from "./prompt-rules";

/**
 * AI parent progress report (spec §6 / curriculum assessment.md §3). The model
 * writes a warm, specific, HONEST narrative for a parent, grounded STRICTLY in
 * the skill states + recent activity we pass it. As with practice.ts, the zod
 * schema is the boundary: we return only schema-parsed output and throw on any
 * failure, so the caller can fall back to a friendly "unavailable" message and
 * never surfaces raw model text.
 *
 * Grounding posture (child-data, spec §8): the prompt is built solely from the
 * skills/recent the caller supplies. The model is told not to invent data,
 * scores, or skills, and to frame an asynchronous profile (strong in some
 * strands, emerging in others) as the normal, healthy thing it is.
 */

/** Cap list lengths so a chatty model can't pad the report into a wall of text. */
const MIN_LIST = 2;
const MAX_LIST = 4;

/** A single skill state, already mapped from a slug to parent-readable labels. */
export interface ProgressReportSkill {
  /** Human label, e.g. "Vowel teams in longer words". */
  label: string;
  /** Strand the skill belongs to, e.g. "reading" / "math" / "writing". */
  domain: string;
  /** not_yet / emerging / solid (the only three honest states; assessment.md §3). */
  outcome: SkillOutcome;
}

/** A recent activity result, already reduced to what the parent sees. */
interface ProgressReportRecent {
  title: string;
  stars: number;
}

export interface ProgressReportInput {
  learnerName: string;
  /** The skill states to ground the report in. Empty is allowed (nothing yet). */
  skills: ProgressReportSkill[];
  /** Optional recent activity, newest first. */
  recent?: ProgressReportRecent[];
}

/**
 * The validated report. Each list holds {@link MIN_LIST}..{@link MAX_LIST} short
 * items; `summary` and `suggestion` are short paragraphs of plain prose.
 */
const progressReportSchema = z.object({
  summary: z.string().min(1).max(800),
  wins: z.array(z.string().min(1).max(240)).min(MIN_LIST).max(MAX_LIST),
  reinforce: z.array(z.string().min(1).max(240)).min(MIN_LIST).max(MAX_LIST),
  suggestion: z.string().min(1).max(400),
});

export type ProgressReport = z.output<typeof progressReportSchema>;

function buildSystemPrompt(): string {
  return [
    "You write a short weekly progress report for the parent of a young child using a learning app.",
    JSON_ONLY_RULE,
    "Voice: warm, calm, specific, and HONEST. Speak to the parent as a thoughtful teacher would, not in baby talk.",
    "Ground every statement STRICTLY in the skills and recent activity provided. Never invent data, scores, grade levels, skills, or activities that were not given to you.",
    "Use only the three honest states you are given (not yet, emerging, solid). Do not translate them into numbers, percentages, or letter grades.",
    "A child is often asynchronous: strong in some strands while just emerging in others. Treat this as normal and healthy, and frame it positively without hiding it.",
    "Be concrete. Prefer 'is reading two-syllable vowel-team words on her own' over 'is doing great'. Reference the actual skill labels.",
    "If little or no data is provided, say so plainly and warmly rather than inventing progress.",
    "summary: 2 to 4 plain sentences for the parent. wins: things going well now. reinforce: things still emerging, framed as next steps, never as failures. suggestion: one gentle, doable thing to try at home this week.",
    `Each of wins and reinforce has ${MIN_LIST} to ${MAX_LIST} short items.`,
    UNTRUSTED_DATA_RULE,
    NO_EM_DASHES_RULE,
  ].join(" ");
}

/** Group skills by strand so the model sees the per-strand spread (the asynchrony). */
function describeSkills(skills: ProgressReportSkill[]): string {
  if (skills.length === 0) {
    return "No skills have been assessed yet; there is no progress data to report.";
  }
  const byDomain = new Map<string, ProgressReportSkill[]>();
  for (const skill of skills) {
    const list = byDomain.get(skill.domain) ?? [];
    list.push(skill);
    byDomain.set(skill.domain, list);
  }
  const lines: string[] = [];
  for (const [domain, list] of byDomain) {
    const items = list.map((s) => `${s.label} (${s.outcome})`).join("; ");
    lines.push(`- ${domain}: ${items}`);
  }
  return lines.join("\n");
}

function describeRecent(recent: ProgressReportRecent[]): string {
  if (recent.length === 0) return "No recent activity provided.";
  // `title` is usually a catalog activity title, but for an attempt whose
  // activityId isn't in the catalog it falls back to the raw, authenticated-
  // client-supplied `kind` (recordAttempt accepts any string ≤60). Fence it so
  // it can't break out of the prompt — same posture as learnerName above.
  return recent.map((r) => `- ${fenceUntrusted(r.title)} (${r.stars} of 3 stars)`).join("\n");
}

function buildUserPrompt(input: ProgressReportInput): string {
  const recent = input.recent ?? [];
  return [
    `Write a weekly progress report for this child: ${fenceUntrusted(input.learnerName)}.`,
    "",
    "Skill states, grouped by strand (these are the only states; do not invent others):",
    describeSkills(input.skills),
    "",
    "Recent activity (newest first):",
    describeRecent(recent),
    "",
    'Return JSON exactly as: { "summary": string, "wins": string[], "reinforce": string[], "suggestion": string }.',
  ].join("\n");
}

/**
 * Generate a validated parent progress report from the provided skill states +
 * recent activity. Uses the richer tutor route (reasoning on) for warmer prose.
 * Throws on transport, non-2xx, malformed, or schema-invalid output; the caller
 * is expected to catch and show a friendly fallback.
 */
export async function generateProgressReport(
  input: ProgressReportInput,
  options: { signal?: AbortSignal } = {},
): Promise<ProgressReport> {
  return chatJSON({
    model: TUTOR_RICH,
    system: buildSystemPrompt(),
    user: buildUserPrompt(input),
    schema: progressReportSchema,
    // A touch more warmth than bounded practice, still grounded by the schema.
    temperature: 0.6,
    signal: options.signal,
  });
}
