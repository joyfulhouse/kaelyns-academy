import type { SkillOutcome } from "@/content";

/** Day gaps for each spaced-repetition rung. */
export const REVIEW_LADDER_DAYS = [1, 3, 7, 21] as const;

export interface ReviewScheduleState {
  intervalIndex: number;
  nextReviewOn: string;
  lastReviewedOn: string | null;
  lastOutcome: SkillOutcome | null;
}

/** Move one rung up the ladder, clamped to the 21-day interval. */
export function promote(intervalIndex: number): number {
  return Math.min(intervalIndex + 1, REVIEW_LADDER_DAYS.length - 1);
}

/** A struggle always returns the schedule to the first rung. */
export function demote(): number {
  return 0;
}

/** Add calendar days to a YYYY-MM-DD key without consulting the clock. */
export function addDays(day: string, days: number): string {
  const result = new Date(`${day}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Resolve the next review day for one ladder rung. */
export function nextReviewOn(day: string, intervalIndex: number): string {
  const days = REVIEW_LADDER_DAYS[intervalIndex];
  if (days === undefined) throw new RangeError(`Invalid review interval index: ${intervalIndex}`);
  return addDays(day, days);
}

/**
 * Fold a freshly-derived mastery outcome into the sparse review schedule.
 * A never-solid skill stays absent; first mastery starts at one day; later
 * successes promote and later struggles reset to one day.
 */
export function nextSchedule(
  current: ReviewScheduleState | null,
  outcome: SkillOutcome,
  day: string,
): ReviewScheduleState | null {
  if (!current) {
    if (outcome !== "solid") return null;
    const intervalIndex = 0;
    return {
      intervalIndex,
      nextReviewOn: nextReviewOn(day, intervalIndex),
      lastReviewedOn: null,
      lastOutcome: outcome,
    };
  }

  const intervalIndex = outcome === "solid" ? promote(current.intervalIndex) : demote();
  return {
    intervalIndex,
    nextReviewOn: nextReviewOn(day, intervalIndex),
    lastReviewedOn: day,
    lastOutcome: outcome,
  };
}
