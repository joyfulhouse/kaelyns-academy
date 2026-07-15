import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACTIVITY_CONFIG_SCHEMAS } from "./activity-configs";
import { PROGRAMS, getSkill } from "./index";
import { getLanguage } from "./languages";
import { kaelynAdaptive } from "./programs/kaelyn-adaptive";
import { decodableReadersUnit } from "./programs/kaelyn-adaptive/decodable-readers";
import { lifeSkillsMathUnit } from "./programs/kaelyn-adaptive/life-skills-math";
import { mathUnit } from "./programs/kaelyn-adaptive/math";
import { mathBaselineUnit } from "./programs/kaelyn-adaptive/math-baseline";
import { readingUnit } from "./programs/kaelyn-adaptive/reading";
import { readingBaselineUnit } from "./programs/kaelyn-adaptive/reading-baseline";
import { scienceNatureUnit } from "./programs/kaelyn-adaptive/science-nature";
import { wordStudyUnit } from "./programs/kaelyn-adaptive/word-study";
import { writingUnit } from "./programs/kaelyn-adaptive/writing";
import { getActivityType, isActivityKindRegistered } from "@/activities";
import { SKILLS } from "./skills";

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
  it("assembles Kaelyn's adaptive units without changing serialized content or order", () => {
    expect(kaelynAdaptive.units).toEqual([
      readingUnit,
      wordStudyUnit,
      writingUnit,
      mathUnit,
      lifeSkillsMathUnit,
      scienceNatureUnit,
      decodableReadersUnit,
      readingBaselineUnit,
      mathBaselineUnit,
    ]);
    expect(
      createHash("sha256").update(JSON.stringify(kaelynAdaptive)).digest("hex"),
    ).toBe("caaafcbabee35db10a431d1a3d30c43f728690701b59c2835f5d33a8ae1fc27d");
  });

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

  it("keeps grouping and regrouping on the mathematical model that performs them", () => {
    const equalGroups = everyActivity().find(
      ({ activity }) => activity.id === "math-r2-a2",
    )?.activity;
    expect(equalGroups?.kind).toBe("math-array");
    if (equalGroups?.kind === "math-array") {
      expect(equalGroups.config.mode).toBe("multiply");
    }

    const regrouping = everyActivity().find(
      ({ activity }) => activity.id === "math-r7-a1",
    )?.activity;
    expect(regrouping?.kind).toBe("math-tenframe");
    if (regrouping?.kind === "math-tenframe") {
      expect(regrouping.config.mode).toBe("make-ten");
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

  it("activity ids are globally unique across programs", () => {
    // Attempts are stored by activityId alone (no program column), so a
    // cross-program duplicate id would leak completion/stars between programs.
    const ids = everyActivity().map(({ activity }) => activity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Life Skills Math unit uses registered kinds + real skills", () => {
    const unit = kaelynAdaptive.units.find((u) => u.id === "life-skills-math");
    expect(unit).toBeDefined();
    const acts = unit!.lessons.flatMap((l) => l.activities);
    expect(acts.length).toBeGreaterThanOrEqual(9);
    const kinds = new Set(["math-clock", "math-money", "math-measure"]);
    expect(acts.every((a) => kinds.has(a.kind))).toBe(true);
    const skills = new Set(SKILLS.map((s) => s.slug));
    expect(acts.every((a) => a.skillTags.every((t) => skills.has(t)))).toBe(true);
  });

  it("Science & Nature unit uses registered kinds + real skills", () => {
    const unit = kaelynAdaptive.units.find((u) => u.id === "science-nature");
    expect(unit).toBeDefined();
    expect(unit!.world).toBe("ocean");
    const acts = unit!.lessons.flatMap((l) => l.activities);
    expect(acts.length).toBeGreaterThanOrEqual(9);
    // Only registered kinds — the new science kinds plus the reused reading kind.
    const kinds = new Set(["sort-categories", "seq-order", "reading-comprehension"]);
    expect(acts.every((a) => kinds.has(a.kind))).toBe(true);
    // Exercises the science skills (the point of this unit) — every tag resolves.
    const skills = new Set(SKILLS.map((s) => s.slug));
    expect(acts.every((a) => a.skillTags.every((t) => skills.has(t)))).toBe(true);
    // Every sort-categories/seq-order config parses (incl. the bin-id refine).
    for (const a of acts) {
      const schema = ACTIVITY_CONFIG_SCHEMAS[a.kind] as { parse: (x: unknown) => unknown };
      expect(() => schema.parse(a.config), `${a.id} (${a.kind})`).not.toThrow();
    }
  });

  it("has a baseline check-in unit per placement-enabled academic strand", () => {
    const program = PROGRAMS.find((p) => p.slug === "kaelyn-adaptive")!;
    const baselines = program.units.filter((u) => u.checkpoint === "baseline");
    // C1 ships Reading + Math baselines only. Word Study is still deferred: B3
    // fixed the phonics-wordbuild/sightword-game evidence (see the invariant test
    // below), but the strand's reading-comprehension activities still emit the
    // reading.* rubric skills — disjoint from their authored word.*/vocab.* tags —
    // so a Word Study baseline would seed the wrong skills and fail to place.
    expect(baselines.map((u) => u.id).sort()).toEqual(["math-baseline", "reading-baseline"]);
    for (const u of baselines) {
      const acts = u.lessons.flatMap((l) => l.activities);
      expect(acts.length, u.id).toBeGreaterThanOrEqual(5);
      for (const a of acts) {
        expect(isActivityKindRegistered(a.kind), `${a.id} (${a.kind})`).toBe(true);
        for (const t of a.skillTags) expect(SKILLS.some((s) => s.slug === t), `${a.id}: ${t}`).toBe(true);
      }
    }
  });

  it("Word Study wordbuild/sightword runtime skill evidence targets their authored skillTags", () => {
    const program = PROGRAMS.find((p) => p.slug === "kaelyn-adaptive")!;
    const unit = program.units.find((u) => u.id === "word-study")!;
    // B3 fixed these two kinds so their evidence lands on the authored word.*/
    // vocab.* skills the recommender gates on. reading-comprehension is excluded:
    // it emits the reading.* rubric skills by design (a separate, out-of-scope
    // mismatch tracked for its own fix — see the baseline check-in test above).
    const scoped = new Set(["phonics-wordbuild", "sightword-game"]);
    let checked = 0;
    for (const lesson of unit.lessons) {
      for (const a of lesson.activities) {
        if (!scoped.has(a.kind)) continue;
        const type = getActivityType(a.kind)!;
        const emitted = type.skillsAffected(a.config as never);
        for (const s of emitted) {
          expect(a.skillTags, `${a.id} emits ${s}`).toContain(s);
        }
        checked += 1;
      }
    }
    // Guard against the loop silently matching nothing (unit re-id, kind rename).
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("oral-reading runtime skill evidence stays inside authored skillTags", () => {
    let checked = 0;
    for (const { activity } of everyActivity()) {
      if (activity.kind !== "oral-reading") continue;
      const type = getActivityType(activity.kind)!;
      for (const skill of type.skillsAffected(activity.config)) {
        expect(activity.skillTags, `${activity.id} emits ${skill}`).toContain(skill);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("Decodable Readers contains ready-band sentence fluency activities", () => {
    const unit = kaelynAdaptive.units.find((u) => u.id === "decodable-readers");
    expect(unit).toBeDefined();
    expect(unit!.world).toBe("ocean");
    expect(unit!.checkpoint).toBeUndefined();

    const activities = unit!.lessons.flatMap((lesson) => lesson.activities);
    expect(activities.length).toBeGreaterThanOrEqual(24);

    for (const activity of activities) {
      expect(activity.kind).toBe("oral-reading");
      expect(activity.band).toBe("ready");
      expect(activity.skillTags).toHaveLength(1);
      expect(activity.skillTags[0]).toMatch(/^phonics\.decode\./);
      if (activity.kind !== "oral-reading") continue;

      expect(activity.config.mode).toBe("sentence");
      if (activity.config.mode !== "sentence") continue;

      expect(activity.config.skillTag).toBe(activity.skillTags[0]);
      expect(activity.config.passage.split(/\s+/).length).toBeLessThanOrEqual(7);
    }

    // Each lesson carries its own decode skill so progression, recommendations,
    // and spaced review advance pattern by pattern (CVC → digraphs → blends).
    const lessonSkills = unit!.lessons.map(
      (lesson) => new Set(lesson.activities.flatMap((a) => a.skillTags)),
    );
    for (const skills of lessonSkills) expect(skills.size).toBe(1);
    const distinct = new Set(lessonSkills.flatMap((s) => [...s]));
    expect(distinct.size).toBe(unit!.lessons.length);
  });

  it("authors sentence fluency beside the unchanged v1 word-reading block", () => {
    const unit = kaelynAdaptive.units.find((u) => u.id === "word-study")!;
    const activities = unit.lessons.flatMap((lesson) => lesson.activities);
    const oralReadingActivities = activities.filter(
      (activity) => activity.kind === "oral-reading",
    );
    const sentences = oralReadingActivities.filter(
      (activity) => activity.config.mode === "sentence",
    );

    expect(sentences.map(({ id }) => id)).toEqual([
      "word-sentence-see-cat",
      "word-sentence-run-play",
    ]);
    for (const activity of sentences) {
      expect(activity.band).toBe("ready");
      expect(activity.skillTags).toEqual(["reading.fluency.phrasing"]);
      expect(activity.config.skillTag).toBe("reading.fluency.phrasing");
    }

    const originalWordConfigs = activities
      .filter(
        (activity) =>
          activity.kind === "oral-reading" && activity.id.startsWith("word-oral-"),
      )
      .map(({ id, config }) => ({ id, config }));
    expect(originalWordConfigs).toEqual([
      {
        id: "word-oral-the",
        config: {
          instruction: "Listen, then read this word aloud.",
          target: "the",
          skillTag: "reading.fluency.phrasing",
        },
      },
      {
        id: "word-oral-and",
        config: {
          instruction: "Listen, then read this word aloud.",
          target: "and",
          skillTag: "reading.fluency.phrasing",
        },
      },
      {
        id: "word-oral-to",
        config: {
          instruction: "Listen, then read this word aloud.",
          target: "to",
          skillTag: "reading.fluency.phrasing",
        },
      },
      {
        id: "word-oral-see",
        config: {
          instruction: "Listen, then read this word aloud.",
          target: "see",
          skillTag: "reading.fluency.phrasing",
        },
      },
      {
        id: "word-oral-we-can",
        config: {
          instruction: "Listen, then read these words aloud.",
          target: "we can",
          skillTag: "reading.fluency.phrasing",
        },
      },
    ]);
  });
});

describe("World Languages content matches the canonical inventory", () => {
  it("every symbol-intro symbol equals its inventory entry (glyph, spoken, romanization)", () => {
    for (const { activity } of everyActivity()) {
      if (activity.kind !== "lang-symbol-intro") continue;
      const domain = getSkill(activity.skillTags[0])?.domain;
      const lang = domain ? getLanguage(domain) : undefined;
      expect(lang, `${activity.id}: language`).toBeDefined();
      if (!lang) continue;
      for (const s of activity.config.symbols) {
        const entry = lang.inventory.find((e) => e.id === s.id);
        expect(entry, `${activity.id}: ${s.id} not in inventory`).toBeDefined();
        if (!entry) continue;
        expect(entry.symbol, `${activity.id}: ${s.id} glyph`).toBe(s.symbol);
        expect(entry.spoken, `${activity.id}: ${s.id} spoken`).toBe(s.spoken);
        expect(entry.romanization, `${activity.id}: ${s.id} romanization`).toBe(s.romanization);
      }
    }
  });
});
