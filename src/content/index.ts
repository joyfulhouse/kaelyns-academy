import { kaelynAdaptive } from "./programs/kaelyn-adaptive";
import { worldLanguages } from "./programs/world-languages";
import type { Activity, Lesson, Program, Unit } from "./types";

export * from "./types";
export { SKILLS, getSkill } from "./skills";

// Program 02 — Kaelyn's Adaptive Curriculum — is the program the app serves.
// Program 01 (summer-k-to-grade1.ts) stays on disk, archived, but is no longer
// in PROGRAMS; it was review, not learning, for this learner.
export const PROGRAMS: Program[] = [kaelynAdaptive, worldLanguages];

export function listPrograms(): Program[] {
  return PROGRAMS;
}

export function getProgram(slug: string): Program | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

export function getUnit(program: Program, unitId: string): Unit | undefined {
  return program.units.find((u) => u.id === unitId);
}

export function getLesson(unit: Unit, lessonId: string): Lesson | undefined {
  return unit.lessons.find((l) => l.id === lessonId);
}

export function findActivity(
  program: Program,
  activityId: string,
): { unit: Unit; lesson: Lesson; activity: Activity } | undefined {
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      const activity = lesson.activities.find((a) => a.id === activityId);
      if (activity) return { unit, lesson, activity };
    }
  }
  return undefined;
}

export function programStats(program: Program): {
  units: number;
  lessons: number;
  activities: number;
} {
  let lessons = 0;
  let activities = 0;
  for (const unit of program.units) {
    lessons += unit.lessons.length;
    for (const lesson of unit.lessons) activities += lesson.activities.length;
  }
  return { units: program.units.length, lessons, activities };
}
