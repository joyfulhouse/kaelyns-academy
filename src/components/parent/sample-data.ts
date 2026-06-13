import type { SkillOutcome, SkillTag } from "@/content";

/**
 * ILLUSTRATIVE parent-surface data, NOT real telemetry.
 *
 * There is no attempt/skill-state database yet (lands with DB-backed progress,
 * see spec §8 + the P6 TODOs in `@/lib/tenancy`). Per the child-data posture,
 * we must not present fabricated numbers as if they were measured. Everything
 * here is a hand-authored sample so the dashboard can show its real shape
 * (loading, empty, and populated states) and is labeled "Sample" wherever it
 * surfaces. The single real child datum is a display name + birth month, which
 * is the only learner PII the platform keeps.
 */

export const SAMPLE_NOTICE =
  "Sample data shown for layout. Real progress appears once your learner starts activities.";

export interface SampleLearner {
  id: string;
  /** Display name only: the permitted child PII (spec §8). */
  name: string;
  /** Birth month only, never a full birth date. */
  birthMonth: string;
  programSlug: string;
  enrolledOn: string;
  /** Current unit the learner is working through (1-based order). */
  currentUnitOrder: number;
}

/** The pilot learner. Name + birth month are the only fields a real record holds. */
export const SAMPLE_LEARNER: SampleLearner = {
  id: "kaelyn",
  name: "Kaelyn",
  birthMonth: "August",
  programSlug: "summer-k-to-grade1",
  enrolledOn: "June 2026",
  currentUnitOrder: 3,
};

/** Illustrative skill states keyed by the real Program 01 skill slugs. */
export const SAMPLE_SKILL_STATE: Partial<Record<SkillTag, SkillOutcome>> = {
  // Phonics
  "phonics.cvc": "solid",
  "phonics.digraphs": "solid",
  "phonics.blends.initial": "emerging",
  "phonics.blends.final": "emerging",
  "phonics.silent-e": "not_yet",
  // Reading
  "reading.sight-words": "emerging",
  "reading.decodable": "emerging",
  // Writing
  "writing.sentence": "emerging",
  // Math
  "math.counting": "solid",
  "math.place-value": "emerging",
  "math.addition": "emerging",
  "math.subtraction": "not_yet",
  // Habits
  "habits.stamina": "solid",
};

export interface SampleActivityRecord {
  id: string;
  title: string;
  /** Activity kind label for the parent (plain language). */
  kindLabel: string;
  /** e.g. "2 days ago": relative, illustrative. */
  when: string;
  correct: number;
  total: number;
  stars: 0 | 1 | 2 | 3;
}

/** Illustrative recent activity, newest first. */
export const SAMPLE_RECENT: SampleActivityRecord[] = [
  { id: "r1", title: "Digraph dive", kindLabel: "Build a word", when: "Today", correct: 3, total: 3, stars: 3 },
  { id: "r2", title: "Make a teen", kindLabel: "Ten-frame", when: "Today", correct: 4, total: 5, stars: 2 },
  { id: "r3", title: "Treasure words", kindLabel: "Sight words", when: "Yesterday", correct: 3, total: 4, stars: 2 },
  { id: "r4", title: "Build a CVC word", kindLabel: "Build a word", when: "2 days ago", correct: 3, total: 3, stars: 3 },
  { id: "r5", title: "Show this number", kindLabel: "Ten-frame", when: "3 days ago", correct: 6, total: 7, stars: 2 },
];

/** Illustrative week-over-week activity counts (for a calm sparkline-free summary). */
export const SAMPLE_WEEK_MINUTES = 84;
export const SAMPLE_WEEK_ACTIVITIES = 11;
export const SAMPLE_UNITS_DONE = 2;

export function outcomeCounts(
  state: Partial<Record<SkillTag, SkillOutcome>>,
): Record<SkillOutcome, number> {
  const counts: Record<SkillOutcome, number> = { not_yet: 0, emerging: 0, solid: 0 };
  for (const outcome of Object.values(state)) {
    if (outcome) counts[outcome] += 1;
  }
  return counts;
}
