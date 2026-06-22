import { describe, expect, it, vi } from "vitest";
import type { ProgramTreeRows } from "./store";

// Capture non-critical is called on bad configs — mock Sentry so it doesn't blow up in test env.
vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: vi.fn(),
}));

// Lazy import so the mock is in place before the module loads.
const { assembleProgram, buildVersionTreeRows, findDuplicateKeys } = await import("./store");
type EditableUnit = import("./store").EditableUnit;

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
    // Node ids are the STABLE AUTHORED KEYS (unitKey/lessonKey/activityKey), not
    // the per-version row UUIDs — so they match static-program ids and stay
    // version-portable. Ordering is still by orderKey ascending (u1 before u2).
    expect(program.units[0].id).toBe("reading"); // u1.unitKey, orderKey "01"
    expect(program.units[1].id).toBe("math"); // u2.unitKey, orderKey "02"
    // Lessons ordered by orderKey ascending; id === lessonKey
    expect(program.units[0].lessons[0].id).toBe("lesson-1"); // l1.lessonKey
    expect(program.units[0].lessons[1].id).toBe("lesson-2"); // l2.lessonKey
    // Activities ordered by orderKey ascending; id === activityKey
    expect(program.units[0].lessons[0].activities[0].id).toBe("act-1"); // a1.activityKey
    expect(program.units[0].lessons[0].activities[1].id).toBe("act-2"); // a2.activityKey
    // Units carry 1-based order indices (matching the authored static contract)
    expect(program.units[0].order).toBe(1);
    expect(program.units[1].order).toBe(2);
    // Lessons carry 1-based order indices
    expect(program.units[0].lessons[0].order).toBe(1);
    expect(program.units[0].lessons[1].order).toBe(2);
    // Unit with no lessons (u2) has empty lessons array
    expect(program.units[1].lessons).toHaveLength(0);
  });

  it("uses authored keys (unitKey/lessonKey/activityKey) as node ids, never row UUIDs", () => {
    // The version pinning contract (Fix-E): assembled node ids MUST be the stable
    // authored keys, so a DB program's ids are shaped exactly like a static one
    // and survive a republish to a new version (whose rows get fresh UUIDs).
    const rows: ProgramTreeRows = {
      version: baseVersion,
      units: [
        {
          id: "11111111-1111-1111-1111-111111111111", // per-version row UUID
          programVersionId: "v1",
          unitKey: "reading",
          orderKey: "00",
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
        {
          id: "22222222-2222-2222-2222-222222222222",
          unitId: "11111111-1111-1111-1111-111111111111",
          lessonKey: "reading-r1",
          orderKey: "00",
          title: "Lesson 1",
        },
      ],
      activities: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          lessonId: "22222222-2222-2222-2222-222222222222",
          activityKey: "reading-r1-a1",
          orderKey: "00",
          kind: "sightword-game",
          title: "Sight Words",
          blurb: null,
          estMinutes: 5,
          band: "ready",
          skillTags: ["reading.sight"],
          standardTags: [],
          config: { instruction: "Tap the word", words: ["the", "and"], decoys: [] },
        },
      ],
    };

    const program = assembleProgram(rows);
    const unit = program.units[0];
    const lesson = unit.lessons[0];
    const activity = lesson.activities[0];

    // Ids are the authored keys…
    expect(unit.id).toBe("reading");
    expect(lesson.id).toBe("reading-r1");
    expect(activity.id).toBe("reading-r1-a1");
    // …and explicitly NOT the per-version row UUIDs.
    expect(unit.id).not.toBe("11111111-1111-1111-1111-111111111111");
    expect(lesson.id).not.toBe("22222222-2222-2222-2222-222222222222");
    expect(activity.id).not.toBe("33333333-3333-3333-3333-333333333333");
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

    expect(activity.id).toBe("tenframe-1"); // activityKey, not the row UUID "a1"
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
    expect(activities[0].id).toBe("good"); // activityKey of the valid row
    // the bad-config row (activityKey "bad") was silently dropped
    expect(activities.find((a) => a.id === "bad")).toBeUndefined();
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

// ── buildVersionTreeRows ──────────────────────────────────────────────────────

describe("buildVersionTreeRows", () => {
  const VERSION_ID = "ver-123";

  it("generates zero-padded orderKeys per sibling level", () => {
    const units = [
      {
        unitKey: "unit-a",
        title: "Unit A",
        world: "sunshine",
        lessons: [
          {
            lessonKey: "lesson-1",
            title: "Lesson 1",
            activities: [
              {
                activityKey: "act-1",
                kind: "math-tenframe",
                title: "Activity 1",
                band: "ready",
                skillTags: [],
                standardTags: [],
                config: { instruction: "Do it", mode: "represent", target: 3 },
              },
              {
                activityKey: "act-2",
                kind: "math-tenframe",
                title: "Activity 2",
                band: "ready",
                skillTags: [],
                standardTags: [],
                config: { instruction: "Do it", mode: "represent", target: 5 },
              },
            ],
          },
        ],
      },
      {
        unitKey: "unit-b",
        title: "Unit B",
        world: "garden",
        lessons: [],
      },
    ];

    const result = buildVersionTreeRows(VERSION_ID, units);

    // Two unit rows, orderKeys 000000 and 000001
    expect(result.units).toHaveLength(2);
    expect(result.units[0].orderKey).toBe("000000");
    expect(result.units[1].orderKey).toBe("000001");

    // One lesson row, orderKey 000000
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].orderKey).toBe("000000");

    // Two activity rows, orderKeys 000000 and 000001
    expect(result.activities).toHaveLength(2);
    expect(result.activities[0].orderKey).toBe("000000");
    expect(result.activities[1].orderKey).toBe("000001");
  });

  it("preserves authored keys (unitKey, lessonKey, activityKey)", () => {
    const units = [
      {
        unitKey: "my-unit-key",
        title: "Unit",
        world: "sunshine",
        lessons: [
          {
            lessonKey: "my-lesson-key",
            title: "Lesson",
            activities: [
              {
                activityKey: "my-act-key",
                kind: "sightword-game",
                title: "Activity",
                band: "ready",
                skillTags: ["reading.sight"],
                standardTags: [],
                config: { instruction: "Tap the word", words: ["the", "and"], decoys: [] },
              },
            ],
          },
        ],
      },
    ];

    const result = buildVersionTreeRows(VERSION_ID, units);

    expect(result.units[0].unitKey).toBe("my-unit-key");
    expect(result.lessons[0].lessonKey).toBe("my-lesson-key");
    expect(result.activities[0].activityKey).toBe("my-act-key");
  });

  it("links units to the supplied versionId", () => {
    const units = [
      { unitKey: "u1", title: "U1", world: "sunshine", lessons: [] },
    ];
    const result = buildVersionTreeRows(VERSION_ID, units);
    expect(result.units[0].programVersionId).toBe(VERSION_ID);
  });

  it("links lessons to the correct unit id", () => {
    const units = [
      {
        unitKey: "u1",
        title: "U1",
        world: "sunshine",
        lessons: [{ lessonKey: "l1", title: "L1", activities: [] }],
      },
    ];
    const result = buildVersionTreeRows(VERSION_ID, units);
    expect(result.lessons[0].unitId).toBe(result.units[0].id);
  });

  it("links activities to the correct lesson id", () => {
    const units = [
      {
        unitKey: "u1",
        title: "U1",
        world: "sunshine",
        lessons: [
          {
            lessonKey: "l1",
            title: "L1",
            activities: [
              {
                activityKey: "a1",
                kind: "math-tenframe",
                title: "A1",
                band: "ready",
                skillTags: [],
                standardTags: [],
                config: { instruction: "Do", mode: "represent", target: 2 },
              },
            ],
          },
        ],
      },
    ];
    const result = buildVersionTreeRows(VERSION_ID, units);
    expect(result.activities[0].lessonId).toBe(result.lessons[0].id);
  });

  it("returns empty arrays for an empty unit list", () => {
    const result = buildVersionTreeRows(VERSION_ID, []);
    expect(result.units).toHaveLength(0);
    expect(result.lessons).toHaveLength(0);
    expect(result.activities).toHaveLength(0);
  });
});

// ── findDuplicateKeys ─────────────────────────────────────────────────────────

describe("findDuplicateKeys", () => {
  function unit(unitKey: string, lessons: EditableUnit["lessons"] = []): EditableUnit {
    return { unitKey, title: unitKey, world: "sunshine", lessons };
  }
  function lesson(lessonKey: string, activityKeys: string[] = []): EditableUnit["lessons"][number] {
    return {
      lessonKey,
      title: lessonKey,
      activities: activityKeys.map((activityKey) => ({
        activityKey,
        kind: "math-tenframe",
        title: activityKey,
        band: "ready",
        skillTags: [],
        standardTags: [],
        config: {},
      })),
    };
  }

  it("returns null for a fully-unique tree", () => {
    const tree = [
      unit("u1", [lesson("l1", ["a1", "a2"]), lesson("l2", ["a3"])]),
      unit("u2", [lesson("l3", ["a4"])]),
    ];
    expect(findDuplicateKeys(tree)).toBeNull();
  });

  it("detects a duplicate unitKey within a version", () => {
    expect(findDuplicateKeys([unit("dup"), unit("dup")])).toEqual({ level: "unit", key: "dup" });
  });

  it("detects a duplicate lessonKey within a unit", () => {
    const tree = [unit("u1", [lesson("dup"), lesson("dup")])];
    expect(findDuplicateKeys(tree)).toEqual({ level: "lesson", key: "dup" });
  });

  it("detects a duplicate activityKey within a lesson", () => {
    const tree = [unit("u1", [lesson("l1", ["dup", "dup"])])];
    expect(findDuplicateKeys(tree)).toEqual({ level: "activity", key: "dup" });
  });

  it("detects a duplicate activityKey ACROSS lessons (program-wide uniqueness)", () => {
    // Fix-E Layer 1: activity.id = activityKey and findActivity returns the FIRST
    // match program-wide, so the same activityKey in two different lessons (even
    // under different units) is a collision — the second would be unreachable.
    const crossLesson = [unit("u1", [lesson("l1", ["a1"]), lesson("l2", ["a1"])])];
    expect(findDuplicateKeys(crossLesson)).toEqual({ level: "activity", key: "a1" });

    const crossUnit = [
      unit("u1", [lesson("l1", ["a1"])]),
      unit("u2", [lesson("l2", ["a1"])]),
    ];
    expect(findDuplicateKeys(crossUnit)).toEqual({ level: "activity", key: "a1" });
  });

  it("allows the same lessonKey under different units (lessonKey is per-unit)", () => {
    // lessonKey "l1" reused across two different units is legal (lesson ids are
    // not the globally-addressable runtime id). Activity keys must still differ
    // program-wide, so use distinct activityKeys here.
    const tree = [
      unit("u1", [lesson("l1", ["a1"])]),
      unit("u2", [lesson("l1", ["a2"])]),
    ];
    expect(findDuplicateKeys(tree)).toBeNull();
  });
});
