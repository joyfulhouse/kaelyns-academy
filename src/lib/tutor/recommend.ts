import type { Activity, Lesson, Program, SkillTag, Unit } from "@/content";
import { outcomeOf, type SkillState } from "./mastery";

/**
 * The next-best recommender. Each strand (unit) advances INDEPENDENTLY: her
 * "current rung" is the first lesson whose progression gates are not met. The
 * recommender never lets a strong strand wait on a weak one (curriculum README §1).
 */

/** Unique skill tags exercised across a unit's activities, in ladder order. */
export function unitSkills(unit: Unit): SkillTag[] {
  const seen = new Set<SkillTag>();
  const out: SkillTag[] = [];
  for (const lesson of unit.lessons) {
    for (const activity of lesson.activities) {
      for (const tag of activity.skillTags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          out.push(tag);
        }
      }
    }
  }
  return out;
}

/** Skills exercised by a single lesson (rung). */
function assessedLessonSkills(lesson: Lesson): SkillTag[] {
  const seen = new Set<SkillTag>();
  for (const activity of lesson.activities) {
    if (activity.kind === "journal-prompt") continue;
    for (const tag of activity.skillTags) seen.add(tag);
  }
  return [...seen];
}

function assessedUnitSkills(unit: Unit): SkillTag[] {
  const seen = new Set<SkillTag>();
  for (const lesson of unit.lessons) {
    for (const skill of assessedLessonSkills(lesson)) seen.add(skill);
  }
  return [...seen];
}

/**
 * Assessed activities remain mastery-gated. Journals deliberately emit no
 * mastery, so each journal is instead gated by its canonical completion id.
 */
function lessonIsComplete(
  lesson: Lesson,
  state: SkillState,
  completed: ReadonlySet<string>,
): boolean {
  const skills = assessedLessonSkills(lesson);
  const journals = lesson.activities.filter((activity) => activity.kind === "journal-prompt");
  const hasProgressGate = skills.length > 0 || journals.length > 0;
  return (
    hasProgressGate &&
    skills.every((skill) => outcomeOf(state, skill) === "solid") &&
    journals.every((activity) => completed.has(activity.id))
  );
}

export interface StrandProgress {
  unit: Unit;
  solidSkills: number;
  totalSkills: number;
  /** 0..1 of assessed-skill and completion-only journal gates reached. */
  ratio: number;
  /** The first lesson whose progression gates are not met, or null if done. */
  currentLesson: Lesson | null;
  currentLessonIndex: number; // 1-based rung number, or unit.lessons.length when done
}

const NO_COMPLETIONS: ReadonlySet<string> = new Set<string>();

export function strandProgress(
  program: Program,
  state: SkillState,
  completed: ReadonlySet<string> = NO_COMPLETIONS,
): StrandProgress[] {
  return program.units.map((unit) => {
    const skills = assessedUnitSkills(unit);
    const solid = skills.filter((s) => outcomeOf(state, s) === "solid").length;
    const journals = unit.lessons.flatMap((lesson) =>
      lesson.activities.filter((activity) => activity.kind === "journal-prompt"),
    );
    const completedJournals = journals.filter((activity) => completed.has(activity.id)).length;
    const totalProgressGates = skills.length + journals.length;
    const idx = unit.lessons.findIndex(
      (lesson) => !lessonIsComplete(lesson, state, completed),
    );
    return {
      unit,
      solidSkills: solid,
      totalSkills: skills.length,
      ratio:
        totalProgressGates === 0
          ? 0
          : (solid + completedJournals) / totalProgressGates,
      currentLesson: idx === -1 ? null : unit.lessons[idx],
      currentLessonIndex: idx === -1 ? unit.lessons.length : idx + 1,
    };
  });
}

export interface Recommendation {
  activity: Activity;
  unit: Unit;
  lesson: Lesson;
  /** Friendly, kid-facing reason this is next. */
  reason: string;
  /** true when she has done this activity before and is practicing toward mastery. */
  isPractice: boolean;
}

/**
 * Pick the next activity within a strand: the first activity at her current rung
 * she hasn't completed; if she has done them all but an assessed skill is not
 * solid yet, recommend re-practicing the one whose skill is still emerging
 * (the tutor can then generate fresh items for it).
 */
function strandNext(
  unit: Unit,
  lesson: Lesson,
  state: SkillState,
  completed: Set<string>,
): Recommendation | null {
  const fresh = lesson.activities.find((a) => !completed.has(a.id));
  if (fresh) {
    const order = unit.lessons.indexOf(lesson) + 1;
    return {
      activity: fresh,
      unit,
      lesson,
      reason: order === 1 ? `Start ${unit.title}` : `Keep climbing in ${unit.title}`,
      isPractice: false,
    };
  }
  // All done at this rung but an assessed skill is not solid: practice that activity.
  const needsWork = lesson.activities.find(
    (activity) =>
      activity.kind !== "journal-prompt" &&
      activity.skillTags.some((skill) => outcomeOf(state, skill) !== "solid"),
  );
  if (needsWork) {
    return {
      activity: needsWork,
      unit,
      lesson,
      reason: `A little more practice in ${unit.title}`,
      isPractice: true,
    };
  }
  return null;
}

/**
 * Ranked next-best recommendations, one per strand that has work left. Ranked to
 * encourage breadth: the strand with the fewest completed activities comes first,
 * so she rotates across reading / words / writing / math rather than grinding one.
 * The learner UI uses [0] as "Your next thing" and the rest as per-strand entries.
 */
export function nextBest(
  program: Program,
  state: SkillState,
  completed: Set<string>,
): Recommendation[] {
  const recs: { rec: Recommendation; done: number }[] = [];
  for (const { unit, currentLesson } of strandProgress(program, state, completed)) {
    if (!currentLesson) continue; // strand progression gates are complete
    const rec = strandNext(unit, currentLesson, state, completed);
    if (!rec) continue;
    const done = unit.lessons.reduce(
      (n, l) => n + l.activities.filter((a) => completed.has(a.id)).length,
      0,
    );
    recs.push({ rec, done });
  }
  recs.sort((a, b) => a.done - b.done);
  return recs.map((r) => r.rec);
}
