import { describe, expect, it } from "vitest";
import { ACTIVITY_CONFIG_SCHEMAS } from "./activity-configs";
import { PROGRAMS, getSkill } from "./index";

/**
 * Whole-curriculum guards across every registered program. TypeScript checks the
 * config *shape* at authoring time, but not Zod refinements (e.g. answerIndex <
 * choices.length) — so we parse every authored config here, and confirm every
 * skill tag resolves and every activity id is unique.
 */
function everyActivity() {
  return PROGRAMS.flatMap((program) =>
    program.units.flatMap((unit) =>
      unit.lessons.flatMap((lesson) =>
        lesson.activities.map((activity) => ({ program, unit, lesson, activity })),
      ),
    ),
  );
}

describe("authored program content", () => {
  it("every activity config parses against its kind's schema", () => {
    for (const { program, activity } of everyActivity()) {
      const schema = ACTIVITY_CONFIG_SCHEMAS[activity.kind] as {
        parse: (input: unknown) => unknown;
      };
      expect(
        () => schema.parse(activity.config),
        `${program.slug}/${activity.id} (${activity.kind})`,
      ).not.toThrow();
    }
  });

  it("every activity skill tag resolves to a known skill", () => {
    for (const { activity } of everyActivity()) {
      for (const tag of activity.skillTags) {
        expect(getSkill(tag), `${activity.id}: ${tag}`).toBeDefined();
      }
    }
  });

  it("activity ids are unique within each program", () => {
    for (const program of PROGRAMS) {
      const ids = program.units.flatMap((u) =>
        u.lessons.flatMap((l) => l.activities.map((a) => a.id)),
      );
      expect(new Set(ids).size, program.slug).toBe(ids.length);
    }
  });
});
