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
  programSlug: "kaelyn-adaptive",
  enrolledOn: "June 2026",
  currentUnitOrder: 1,
};

/**
 * Illustrative skill states keyed by the Program 02 leveled slugs. Deliberately
 * shows Kaelyn's asynchronous profile: reading and math climbing high while
 * writing-transcription sits low, so the parent skill-map normalizes the spread
 * (assessment.md §3) instead of hiding it.
 */
export const SAMPLE_SKILL_STATE: Partial<Record<SkillTag, SkillOutcome>> = {
  // Reading (strong)
  "reading.fluency.phrasing": "solid",
  "reading.comprehension.retell": "solid",
  "reading.comprehension.inference": "emerging",
  "reading.comprehension.main-idea": "emerging",
  "reading.nonfiction.text-features": "not_yet",
  // Word study & vocabulary (climbing)
  "word.vowel-teams.multisyllable": "solid",
  "word.syllables.types": "emerging",
  "word.morphology.prefixes": "emerging",
  "word.morphology.roots": "not_yet",
  "vocab.shades-of-meaning": "emerging",
  // Math (strong)
  "math.equal-groups.arrays": "solid",
  "math.mult.meaning": "solid",
  "math.mult.facts": "emerging",
  "math.div.fact-families": "not_yet",
  "math.place-value.thousands": "emerging",
  "math.regrouping": "emerging",
  "math.fractions.unit": "not_yet",
  // Writing (the lagging strand: ideas race ahead, the hand catches up)
  "writing.compose.sentence": "emerging",
  "writing.compose.two-sentences": "not_yet",
  "writing.transcription.letter-formation": "emerging",
  "writing.transcription.spacing": "not_yet",
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
  { id: "r1", title: "The volcano wakes up", kindLabel: "Read & think", when: "Today", correct: 4, total: 5, stars: 2 },
  { id: "r2", title: "Build the array: 4 × 3", kindLabel: "Make an array", when: "Today", correct: 1, total: 1, stars: 3 },
  { id: "r3", title: "Prefix power: re-", kindLabel: "Build a word", when: "Yesterday", correct: 3, total: 3, stars: 3 },
  { id: "r4", title: "My whale fact", kindLabel: "Compose", when: "Yesterday", correct: 1, total: 1, stars: 3 },
  { id: "r5", title: "Share 12 into groups", kindLabel: "Make an array", when: "2 days ago", correct: 1, total: 1, stars: 2 },
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
