import { kaelynAdaptive } from "./programs/kaelyn-adaptive";
import { worldLanguages } from "./programs/world-languages";
import { SKILLS } from "./skills";
import type { Activity, Lesson, Program, SkillTag, Unit } from "./types";

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

/** Every authored activity id in a program (for program-scoped completion). */
export function activityIdsForProgram(program: Program): string[] {
  const ids: string[] = [];
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) ids.push(activity.id);
    }
  }
  return ids;
}

/** The distinct {@link SkillDomain}s a program touches (from its activities' skills). */
function programDomains(program: Program): Set<string> {
  const domains = new Set<string>();
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        for (const tag of activity.skillTags) {
          const skill = SKILLS.find((s) => s.slug === tag);
          if (skill) domains.add(skill.domain);
        }
      }
    }
  }
  return domains;
}

/**
 * The skill tags a program owns, for scoping skill_state to one program. Built
 * from the union of (a) every skill tag its activities carry and (b) every skill
 * in the rubric whose domain the program touches — so a program's whole strand
 * is scoped even where a rung has no authored activity yet. Falls back to the
 * activities' tags alone when the program touches no rubric domain.
 */
export function skillTagsForProgram(program: Program): SkillTag[] {
  const tags = new Set<SkillTag>();
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        for (const tag of activity.skillTags) tags.add(tag);
      }
    }
  }
  const domains = programDomains(program);
  for (const skill of SKILLS) {
    if (domains.has(skill.domain)) tags.add(skill.slug);
  }
  return [...tags];
}

/** The program (if any) that contains a given authored activity id. */
export function findProgramByActivityId(activityId: string): Program | undefined {
  return PROGRAMS.find((p) => findActivity(p, activityId) !== undefined);
}
