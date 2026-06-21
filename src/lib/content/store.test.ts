import { describe, expect, it, vi } from "vitest";
import type { ProgramTreeRows } from "./store";

// Capture non-critical is called on bad configs — mock Sentry so it doesn't blow up in test env.
vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: vi.fn(),
}));

// Lazy import so the mock is in place before the module loads.
const { assembleProgram } = await import("./store");

describe("assembleProgram", () => {
  const baseVersion = {
    id: "v1",
    programId: "p1",
    version: 1,
    status: "published",
    title: "Test Program",
    subtitle: "A subtitle",
    ageBand: "6-7",
    summary: "A test",
    world: "sunshine",
    locale: "en",
    languages: [] as string[],
    publishedAt: new Date(),
    createdAt: new Date(),
    // programSlug is carried forward from the program table lookup
    programSlug: "test-slug",
  };

  it("builds a Program with units/lessons/activities ordered by orderKey", () => {
    const rows: ProgramTreeRows = {
      version: baseVersion,
      units: [
        {
          id: "u2",
          programVersionId: "v1",
          unitKey: "math",
          orderKey: "02",
          title: "Math",
          emoji: "➕",
          world: "garden",
          bigIdea: "Numbers",
          phonicsFocus: null,
          mathFocus: "Addition",
          project: "Build a number line",
          checkpoint: null,
        },
        {
          id: "u1",
          programVersionId: "v1",
          unitKey: "reading",
          orderKey: "01",
          title: "Reading",
          emoji: "📖",
          world: "sunshine",
          bigIdea: "Words",
          phonicsFocus: "Digraphs",
          mathFocus: null,
          project: "Book talk",
          checkpoint: null,
        },
      ],
      lessons: [
        {
          id: "l2",
          unitId: "u1",
          lessonKey: "lesson-2",
          orderKey: "02",
          title: "Lesson 2",
        },
        {
          id: "l1",
          unitId: "u1",
          lessonKey: "lesson-1",
          orderKey: "01",
          title: "Lesson 1",
        },
      ],
      activities: [
        {
          id: "a2",
          lessonId: "l1",
          activityKey: "act-2",
          orderKey: "02",
          kind: "math-tenframe",
          title: "Activity 2",
          blurb: null,
          estMinutes: 5,
          band: "ready",
          skillTags: ["math.counting"],
          standardTags: [],
          config: { instruction: "Count the dots", mode: "represent", target: 5 },
        },
        {
          id: "a1",
          lessonId: "l1",
          activityKey: "act-1",
          orderKey: "01",
          kind: "math-tenframe",
          title: "Activity 1",
          blurb: null,
          estMinutes: 5,
          band: "ready",
          skillTags: ["math.counting"],
          standardTags: [],
          config: { instruction: "Count the dots", mode: "represent", target: 3 },
        },
      ],
    };

    const program = assembleProgram(rows);

    expect(program.slug).toBe("test-slug");
    expect(program.title).toBe("Test Program");
    expect(program.subtitle).toBe("A subtitle");
    // Units ordered by orderKey ascending
    expect(program.units[0].id).toBe("u1");
    expect(program.units[1].id).toBe("u2");
    // Lessons ordered by orderKey ascending
    expect(program.units[0].lessons[0].id).toBe("l1");
    expect(program.units[0].lessons[1].id).toBe("l2");
    // Activities ordered by orderKey ascending
    expect(program.units[0].lessons[0].activities[0].id).toBe("a1");
    expect(program.units[0].lessons[0].activities[1].id).toBe("a2");
    // Unit with no lessons (u2) has empty lessons array
    expect(program.units[1].lessons).toHaveLength(0);
  });

  it("maps a valid math-tenframe activity row into the Activity union", () => {
    const rows: ProgramTreeRows = {
      version: baseVersion,
      units: [
        {
          id: "u1",
          programVersionId: "v1",
          unitKey: "math",
          orderKey: "01",
          title: "Math",
          emoji: "➕",
          world: "garden",
          bigIdea: "Numbers",
          phonicsFocus: null,
          mathFocus: "Tenframe",
          project: "Count things",
          checkpoint: null,
        },
      ],
      lessons: [
        {
          id: "l1",
          unitId: "u1",
          lessonKey: "lesson-1",
          orderKey: "01",
          title: "Lesson 1",
        },
      ],
      activities: [
        {
          id: "a1",
          lessonId: "l1",
          activityKey: "tenframe-1",
          orderKey: "01",
          kind: "math-tenframe",
          title: "Ten Frame Activity",
          blurb: "Use ten frames",
          estMinutes: 10,
          band: "stretch",
          skillTags: ["math.tenframe"],
          standardTags: ["CCSS.MATH.1.OA"],
          config: { instruction: "Show 7 on the ten frame", mode: "represent", target: 7 },
        },
      ],
    };

    const program = assembleProgram(rows);
    const activity = program.units[0].lessons[0].activities[0];

    expect(activity.id).toBe("a1");
    expect(activity.kind).toBe("math-tenframe");
    expect(activity.title).toBe("Ten Frame Activity");
    expect(activity.blurb).toBe("Use ten frames");
    expect(activity.estMinutes).toBe(10);
    expect(activity.band).toBe("stretch");
    expect(activity.skillTags).toEqual(["math.tenframe"]);
    if (activity.kind === "math-tenframe") {
      expect(activity.config.target).toBe(7);
      expect(activity.config.mode).toBe("represent");
    }
  });

  it("drops an activity whose config fails schema validation (does not throw)", () => {
    const rows: ProgramTreeRows = {
      version: baseVersion,
      units: [
        {
          id: "u1",
          programVersionId: "v1",
          unitKey: "math",
          orderKey: "01",
          title: "Math",
          emoji: "➕",
          world: "garden",
          bigIdea: "Numbers",
          phonicsFocus: null,
          mathFocus: null,
          project: "Count",
          checkpoint: null,
        },
      ],
      lessons: [
        {
          id: "l1",
          unitId: "u1",
          lessonKey: "lesson-1",
          orderKey: "01",
          title: "Lesson 1",
        },
      ],
      activities: [
        {
          id: "good-act",
          lessonId: "l1",
          activityKey: "good",
          orderKey: "01",
          kind: "math-tenframe",
          title: "Good Activity",
          blurb: null,
          estMinutes: 5,
          band: "ready",
          skillTags: [],
          standardTags: [],
          config: { instruction: "Count", mode: "represent", target: 4 },
        },
        {
          id: "bad-act",
          lessonId: "l1",
          activityKey: "bad",
          orderKey: "02",
          kind: "math-tenframe",
          title: "Bad Config Activity",
          blurb: null,
          estMinutes: 5,
          band: "ready",
          skillTags: [],
          standardTags: [],
          // config missing required fields — should be dropped
          config: { mode: "bad-mode", target: "not-a-number" },
        },
      ],
    };

    let program: ReturnType<typeof assembleProgram> | undefined;
    expect(() => {
      program = assembleProgram(rows);
    }).not.toThrow();

    const activities = program!.units[0].lessons[0].activities;
    expect(activities).toHaveLength(1);
    expect(activities[0].id).toBe("good-act");
    // bad-act was silently dropped
    expect(activities.find((a) => a.id === "bad-act")).toBeUndefined();
  });

  it("handles unknown activity kind by dropping the activity", () => {
    const rows: ProgramTreeRows = {
      version: baseVersion,
      units: [
        {
          id: "u1",
          programVersionId: "v1",
          unitKey: "reading",
          orderKey: "01",
          title: "Reading",
          emoji: "📖",
          world: "sunshine",
          bigIdea: "Words",
          phonicsFocus: null,
          mathFocus: null,
          project: "Read",
          checkpoint: null,
        },
      ],
      lessons: [
        { id: "l1", unitId: "u1", lessonKey: "lesson-1", orderKey: "01", title: "Lesson 1" },
      ],
      activities: [
        {
          id: "unknown-act",
          lessonId: "l1",
          activityKey: "unknown",
          orderKey: "01",
          kind: "unknown-future-kind",
          title: "Future Activity",
          blurb: null,
          estMinutes: 5,
          band: "ready",
          skillTags: [],
          standardTags: [],
          config: { someField: "value" },
        },
      ],
    };

    let program: ReturnType<typeof assembleProgram> | undefined;
    expect(() => {
      program = assembleProgram(rows);
    }).not.toThrow();

    expect(program!.units[0].lessons[0].activities).toHaveLength(0);
  });
});
