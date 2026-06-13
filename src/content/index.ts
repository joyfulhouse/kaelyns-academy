import { summerKToGrade1 } from "./programs/summer-k-to-grade1";
import type { Activity, Lesson, Program, Unit } from "./types";

export * from "./types";
export { SKILLS, getSkill } from "./skills";

export const PROGRAMS: Program[] = [summerKToGrade1];

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
