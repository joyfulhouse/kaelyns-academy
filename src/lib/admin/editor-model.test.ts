import { describe, it, expect } from "vitest";
import {
  defaultConfigFor,
  editableToForm,
  formToEditable,
  newActivity,
  newLesson,
  newUnit,
  validateConfigJson,
} from "./editor-model";
import type { EditableVersion } from "@/lib/content/store";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import type { ActivityKind } from "@/content/activity-configs";

// ── Fixture ───────────────────────────────────────────────────────────────────

const FIXTURE: EditableVersion = {
  programId: "prog-1",
  versionId: "ver-1",
  version: 1,
  status: "draft",
  slug: "summer-bridge",
  metadata: {
    title: "Summer Bridge",
    subtitle: "K → 1st",
    ageBand: "5-6",
    summary: "An intro program",
    world: "sunshine",
    locale: "en",
    languages: ["en", "zh-TW"],
  },
  units: [
    {
      unitKey: "unit-01",
      title: "Under the Sea",
      emoji: "🐠",
      world: "ocean",
      bigIdea: "Oceans are full of life",
      phonicsFocus: "sh, ch",
      mathFocus: "addition",
      project: "Build a diorama",
      checkpoint: "baseline",
      lessons: [
        {
          lessonKey: "lesson-01",
          title: "Monday",
          activities: [
            {
              activityKey: "act-01",
              kind: "phonics-wordbuild",
              title: "Build words",
              blurb: "Drag and drop",
              estMinutes: 10,
              band: "ready",
              skillTags: ["word.syllables.types"],
              standardTags: ["CCSS.RF.1.3"],
              config: {
                focus: "sh, ch",
                instruction: "Build words using the tiles",
                tiles: ["sh", "a", "p"],
                words: [{ word: "shap" }],
              },
            },
          ],
        },
      ],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("defaultConfigFor", () => {
  const kinds = Object.keys(ACTIVITY_CONFIG_SCHEMAS) as ActivityKind[];

  it.each(kinds)("produces a valid skeleton for %s", (kind) => {
    const config = defaultConfigFor(kind);
    const result = ACTIVITY_CONFIG_SCHEMAS[kind].safeParse(config);
    expect(result.success, `kind=${kind} errors: ${!result.success ? JSON.stringify(result.error.issues) : ""}`).toBe(true);
  });
});

describe("editableToForm + formToEditable round-trip", () => {
  it("preserves unit/lesson/activity keys and order", () => {
    const form = editableToForm(FIXTURE);
    const back = formToEditable(form);

    expect(back.units).toHaveLength(1);
    expect(back.units[0]?.unitKey).toBe("unit-01");
    expect(back.units[0]?.lessons).toHaveLength(1);
    expect(back.units[0]?.lessons[0]?.lessonKey).toBe("lesson-01");
    expect(back.units[0]?.lessons[0]?.activities).toHaveLength(1);
    expect(back.units[0]?.lessons[0]?.activities[0]?.activityKey).toBe("act-01");
  });

  it("preserves metadata title and languages array", () => {
    const form = editableToForm(FIXTURE);
    const back = formToEditable(form);
    expect(back.metadata.title).toBe("Summer Bridge");
    expect(back.metadata.languages).toEqual(["en", "zh-TW"]);
  });

  it("preserves unit fields (emoji, world, bigIdea, checkpoint)", () => {
    const form = editableToForm(FIXTURE);
    const back = formToEditable(form);
    const u = back.units[0];
    expect(u?.emoji).toBe("🐠");
    expect(u?.world).toBe("ocean");
    expect(u?.bigIdea).toBe("Oceans are full of life");
    expect(u?.checkpoint).toBe("baseline");
  });

  it("preserves activity fields (band, skillTags, estMinutes, config)", () => {
    const form = editableToForm(FIXTURE);
    const back = formToEditable(form);
    const a = back.units[0]?.lessons[0]?.activities[0];
    expect(a?.band).toBe("ready");
    expect(a?.skillTags).toEqual(["word.syllables.types"]);
    expect(a?.standardTags).toEqual(["CCSS.RF.1.3"]);
    expect(a?.estMinutes).toBe(10);
    expect((a?.config as { focus: string })?.focus).toBe("sh, ch");
  });

  it("handles optional fields (no subtitle, no checkpoint, no blurb)", () => {
    const minimal: EditableVersion = {
      ...FIXTURE,
      metadata: { ...FIXTURE.metadata, subtitle: undefined, ageBand: undefined },
      units: [
        {
          unitKey: "unit-min",
          title: "Minimal",
          world: "sunshine",
          lessons: [
            {
              lessonKey: "lesson-min",
              title: "Day 1",
              activities: [
                {
                  activityKey: "act-min",
                  kind: "sightword-game",
                  title: "Sight words",
                  band: "ready",
                  skillTags: [],
                  standardTags: [],
                  config: { instruction: "Pick a word", words: ["the", "and"] },
                },
              ],
            },
          ],
        },
      ],
    };

    const form = editableToForm(minimal);
    const back = formToEditable(form);

    expect(back.metadata.subtitle).toBeUndefined();
    expect(back.units[0]?.checkpoint).toBeUndefined();
    const a = back.units[0]?.lessons[0]?.activities[0];
    expect(a?.blurb).toBeUndefined();
    expect(a?.estMinutes).toBeUndefined();
  });

  it("handles multiple units in order", () => {
    const multi: EditableVersion = {
      ...FIXTURE,
      units: [
        { ...FIXTURE.units[0]!, unitKey: "unit-a", title: "First" },
        { ...FIXTURE.units[0]!, unitKey: "unit-b", title: "Second", lessons: [] },
      ],
    };
    const form = editableToForm(multi);
    const back = formToEditable(form);
    expect(back.units.map((u) => u.unitKey)).toEqual(["unit-a", "unit-b"]);
  });
});

describe("formToEditable config hardening (M2)", () => {
  /** Build a one-activity form whose single activity carries `configJson`. */
  function formWithConfigJson(kind: string, configJson: string) {
    const form = editableToForm(FIXTURE);
    form.units = [
      {
        ...form.units[0]!,
        lessons: [
          {
            ...form.units[0]!.lessons[0]!,
            activities: [
              { ...form.units[0]!.lessons[0]!.activities[0]!, kind, configJson },
            ],
          },
        ],
      },
    ];
    return form;
  }

  function firstActivityConfig(form: ReturnType<typeof editableToForm>): unknown {
    return formToEditable(form).units[0]?.lessons[0]?.activities[0]?.config;
  }

  it("does NOT pass malformed JSON through as a valid-looking config", () => {
    const config = firstActivityConfig(
      formWithConfigJson("phonics-wordbuild", "{ not valid json"),
    );
    // The raw string must never leak through, and whatever sentinel we carry
    // must be rejected by the kind's schema (so the save can't accept it).
    expect(config).not.toBe("{ not valid json");
    expect(typeof config).toBe("object");
    expect(ACTIVITY_CONFIG_SCHEMAS["phonics-wordbuild"].safeParse(config).success).toBe(false);
  });

  it("does NOT pass schema-invalid (but parseable) JSON through as valid", () => {
    // Valid JSON, but tiles must have >= 2 entries — schema-invalid for the kind.
    const config = firstActivityConfig(
      formWithConfigJson(
        "phonics-wordbuild",
        JSON.stringify({ focus: "s", instruction: "Build", tiles: ["s"], words: [{ word: "s" }] }),
      ),
    );
    expect(ACTIVITY_CONFIG_SCHEMAS["phonics-wordbuild"].safeParse(config).success).toBe(false);
  });

  it("passes valid config JSON through as the parsed object", () => {
    const config = firstActivityConfig(
      formWithConfigJson(
        "phonics-wordbuild",
        JSON.stringify({ focus: "sh", instruction: "Build", tiles: ["s", "h"], words: [{ word: "sh" }] }),
      ),
    );
    expect(ACTIVITY_CONFIG_SCHEMAS["phonics-wordbuild"].safeParse(config).success).toBe(true);
    expect((config as { focus: string }).focus).toBe("sh");
  });
});

describe("validateConfigJson", () => {
  it("returns ok for valid phonics-wordbuild JSON", () => {
    const json = JSON.stringify({
      focus: "sh",
      instruction: "Build",
      tiles: ["s", "h"],
      words: [{ word: "sh" }],
    });
    const result = validateConfigJson("phonics-wordbuild", json);
    expect(result.ok).toBe(true);
  });

  it("returns error for invalid JSON", () => {
    const result = validateConfigJson("phonics-wordbuild", "not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/JSON/i);
  });

  it("returns error for unknown kind", () => {
    const result = validateConfigJson("unknown-kind", "{}");
    expect(result.ok).toBe(false);
  });

  it("returns field-level error for schema violation", () => {
    // tiles must have at least 2 elements
    const json = JSON.stringify({
      focus: "sh",
      instruction: "Build",
      tiles: ["s"],
      words: [{ word: "s" }],
    });
    const result = validateConfigJson("phonics-wordbuild", json);
    expect(result.ok).toBe(false);
  });
});

describe("factory functions", () => {
  it("newUnit produces a valid unit with empty lessons", () => {
    const u = newUnit();
    expect(u.unitKey).toBeTruthy();
    expect(u.lessons).toHaveLength(0);
    expect(u.world).toBe("sunshine");
  });

  it("newLesson produces a valid lesson with empty activities", () => {
    const l = newLesson();
    expect(l.lessonKey).toBeTruthy();
    expect(l.activities).toHaveLength(0);
  });

  it("newActivity produces a valid activity with valid configJson", () => {
    const a = newActivity();
    expect(a.activityKey).toBeTruthy();
    const result = validateConfigJson(a.kind, a.configJson);
    expect(result.ok).toBe(true);
  });

  it("seeds unique keys across rapid adds (UUID, not Date.now collision)", () => {
    // 100 of each in the same tick: Date.now()-seeded keys would collide.
    const units = new Set(Array.from({ length: 100 }, () => newUnit().unitKey));
    const lessons = new Set(Array.from({ length: 100 }, () => newLesson().lessonKey));
    const activities = new Set(Array.from({ length: 100 }, () => newActivity().activityKey));
    expect(units.size).toBe(100);
    expect(lessons.size).toBe(100);
    expect(activities.size).toBe(100);
  });
});
