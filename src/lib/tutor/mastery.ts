import type { SkillOutcome, SkillTag } from "@/content";

/**
 * The mastery engine. Pure + framework-free so it runs identically on the
 * client (localStorage-backed skill state today) and the server (DB-backed
 * skill_state later) and is fully unit-testable.
 *
 * Mastery gate (curriculum README §2 / assessment.md): a skill is "solid" only
 * after independent success across >= 2 DISTINCT days (retention, not one lucky
 * session). Any attempt below that is "emerging"; untouched skills are "not_yet".
 */

/** Calendar day, e.g. "2026-06-13". Distinctness across days is the gate. */
export type DayKey = string;

/** One skill's accumulated evidence: per-attempt outcomes stamped by day. */
export interface SkillRecord {
  history: { day: DayKey; outcome: SkillOutcome }[];
}

export type SkillState = Record<SkillTag, SkillRecord>;

/** Number of distinct days on which the skill should be solid before it locks. */
export const MASTERY_DISTINCT_DAYS = 2;

/** Keep history bounded so localStorage can't grow without limit. */
const MAX_HISTORY = 24;

/**
 * Derive the current outcome for one skill from its history.
 *  - solid:   succeeded ("solid") on >= MASTERY_DISTINCT_DAYS distinct days.
 *  - emerging: attempted at all but not yet locked.
 *  - not_yet: never attempted.
 */
export function deriveOutcome(record: SkillRecord | undefined): SkillOutcome {
  if (!record || record.history.length === 0) return "not_yet";
  const solidDays = new Set(
    record.history.filter((h) => h.outcome === "solid").map((h) => h.day),
  );
  if (solidDays.size >= MASTERY_DISTINCT_DAYS) return "solid";
  return "emerging";
}

/** The outcome for a skill given the whole state (convenience). */
export function outcomeOf(state: SkillState, skill: SkillTag): SkillOutcome {
  return deriveOutcome(state[skill]);
}

/** Has this skill been attempted at all? */
export function isAttempted(state: SkillState, skill: SkillTag): boolean {
  return (state[skill]?.history.length ?? 0) > 0;
}

/**
 * Fold one activity's skill evidence into the state, stamped with the day.
 * Returns a new state (does not mutate the input).
 */
export function applyEvidence(
  state: SkillState,
  evidence: { skill: SkillTag; outcome: SkillOutcome }[],
  day: DayKey,
): SkillState {
  const next: SkillState = { ...state };
  for (const { skill, outcome } of evidence) {
    const prior = next[skill]?.history ?? [];
    const history = [...prior, { day, outcome }].slice(-MAX_HISTORY);
    next[skill] = { history };
  }
  return next;
}

/** Tally outcomes across a set of skills (for progress summaries). */
export function tallyOutcomes(
  state: SkillState,
  skills: SkillTag[],
): Record<SkillOutcome, number> {
  const counts: Record<SkillOutcome, number> = { not_yet: 0, emerging: 0, solid: 0 };
  for (const skill of skills) counts[outcomeOf(state, skill)] += 1;
  return counts;
}
