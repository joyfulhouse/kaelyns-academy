import { describe, expect, it } from "vitest";
import { getServerActivityType } from "@/activities/definitions";
import { exactSkillRoutingIssue } from "@/activities/skill-routing";
import { keyboardClub } from "../keyboard-club";
import { nextBest } from "@/lib/tutor";
import { isSequentialProgram, playableUnitIds } from "@/components/learner/unitAccess";
import { isTeachableKey } from "@/activities/_shared/typing/keys";
import type { ActivityKind } from "@/content/activity-configs";
import type { SkillRecord, SkillState } from "@/lib/tutor/mastery";

function activities() {
  return keyboardClub.units.flatMap((unit) =>
    unit.lessons.flatMap((lesson) =>
      lesson.activities.map((activity) => ({ unit, activity })),
    ),
  );
}

describe("Keyboard Club", () => {
  it("walks the keyboard in teaching order", () => {
    expect(keyboardClub.units.map((unit) => unit.id)).toEqual([
      "home-base",
      "sky-row",
      "under-ground",
      "big-letters",
      "word-workshop",
    ]);
  });

  it("is made only of typing activities", () => {
    for (const { activity } of activities()) {
      expect(activity.kind.startsWith("typing-"), activity.id).toBe(true);
    }
  });

  it("routes every activity's skills EXACTLY — authored tags must equal runtime tags", () => {
    for (const { activity } of activities()) {
      expect(
        exactSkillRoutingIssue(activity.kind, activity.config, activity.skillTags),
        activity.id,
      ).toBeNull();
    }
  });

  it("never asks for a key the board does not teach", () => {
    for (const { activity } of activities()) {
      const definition = getServerActivityType(activity.kind as ActivityKind);
      const parsed = definition.schema.parse(activity.config);
      expect(definition.validateGenerated?.(parsed) ?? null, activity.id).toBeNull();
    }
  });

  it("teaches each unit's own row, and nothing a later unit has not reached yet", () => {
    const allowed: Record<string, string[]> = {
      "home-base": [
        "typing.keys.home-row",
        "typing.words.familiar",
        "typing.fluency.rate",
      ],
      "sky-row": ["typing.keys.home-row", "typing.keys.top-row"],
      "under-ground": [
        "typing.keys.home-row",
        "typing.keys.top-row",
        "typing.keys.bottom-row",
      ],
      "big-letters": [
        "typing.keys.home-row",
        "typing.keys.top-row",
        "typing.keys.bottom-row",
        "typing.keys.space",
        "typing.keys.shift",
        "typing.words.familiar",
      ],
      "word-workshop": ["typing.words.familiar", "typing.fluency.rate"],
    };
    for (const { unit, activity } of activities()) {
      for (const tag of activity.skillTags) {
        expect(allowed[unit.id], `${activity.id} → ${tag}`).toContain(tag);
      }
    }
  });

  it("assesses space and shift independently so space cannot complete the capitals lesson", () => {
    const bigLetters = keyboardClub.units.find((unit) => unit.id === "big-letters")!;
    const spaceLesson = bigLetters.lessons.find((lesson) => lesson.id === "big-space")!;
    const shiftLesson = bigLetters.lessons.find((lesson) => lesson.id === "big-shift")!;

    expect(spaceLesson.activities.flatMap((activity) => activity.skillTags)).toEqual([
      "typing.keys.space",
    ]);
    expect(
      new Set(shiftLesson.activities.flatMap((activity) => activity.skillTags)),
    ).toEqual(new Set(["typing.keys.shift"]));
  });

  it("uses only teachable characters in every drill, pool, and word", () => {
    for (const { activity } of activities()) {
      if (activity.kind === "typing-keys") {
        for (const key of activity.config.keys) expect(isTeachableKey(key), key).toBe(true);
      } else if (activity.kind === "typing-catch") {
        for (const key of activity.config.pool) expect(isTeachableKey(key), key).toBe(true);
      } else if (activity.kind === "typing-write") {
        for (const item of activity.config.items) {
          for (const char of item) expect(isTeachableKey(char), `${item}: ${char}`).toBe(true);
        }
      } else if (activity.kind === "typing-race") {
        for (const word of activity.config.words) {
          for (const char of word) expect(isTeachableKey(char), `${word}: ${char}`).toBe(true);
        }
      } else if (activity.kind === "typing-echo") {
        for (const sequence of activity.config.sequences) {
          for (const char of sequence) expect(isTeachableKey(char), `${sequence}: ${char}`).toBe(true);
        }
      }
    }
  });
});

describe("Keyboard Club reachability", () => {
  /** Solid on two distinct days — the mastery gate, met. */
  const SOLID: SkillRecord = {
    history: [
      { day: "2026-07-30", outcome: "solid" },
      { day: "2026-07-31", outcome: "solid" },
    ],
  };

  /** The four units before Word Workshop, in authored order. */
  const THROUGH_BIG_LETTERS = ["home-base", "sky-row", "under-ground", "big-letters"];

  /**
   * Finish every activity in the named units and mark their skills solid,
   * skipping any lesson in `exceptLessons`.
   */
  function after(unitIds: string[], exceptLessons: string[] = []) {
    const completed = new Set<string>();
    const state: SkillState = {};
    const skip = new Set(exceptLessons);
    for (const unit of keyboardClub.units.filter((u) => unitIds.includes(u.id))) {
      for (const lesson of unit.lessons) {
        if (skip.has(lesson.id)) continue;
        for (const activity of lesson.activities) {
          completed.add(activity.id);
          for (const tag of activity.skillTags) state[tag] = SOLID;
        }
      }
    }
    return { completed, state };
  }

  // Word Workshop's skills are a subset of Home Base's, so finishing Home Base
  // used to mark it complete and drop it from every offer, unplayed.
  it("still offers Word Workshop to a child who has only finished Home Base", () => {
    const { completed, state } = after(["home-base"]);
    const recs = nextBest(keyboardClub, state, completed);
    expect(recs.map((r) => r.unit.id)).toContain("word-workshop");
  });

  // Same mechanism one level down: the Star Echo lesson claims only a skill
  // Home Base already teaches.
  it("still offers Star Echo once the rest of Big Letters is done", () => {
    const { completed, state } = after(THROUGH_BIG_LETTERS, ["big-echo"]);
    const recs = nextBest(keyboardClub, state, completed);
    expect(recs.some((r) => r.activity.id === "big-echo-caps")).toBe(true);
  });

  // Quest generation maps `nextBest` onto "Try <unit>" quests, and `nextBest`
  // reasons about the whole program. A parent who assigned only the first four
  // units would otherwise get a daily quest for Word Workshop that the learner
  // can never open and the write path refuses — an inert row burning a slot.
  // `getDailyQuestsAction` composes the same filter this asserts.
  it("drops a curated-out unit from anything quests could offer", () => {
    const { completed, state } = after(THROUGH_BIG_LETTERS);
    const offered = nextBest(keyboardClub, state, completed);
    expect(offered.map((r) => r.unit.id)).toContain("word-workshop");

    const playable = playableUnitIds(keyboardClub.units, new Set(THROUGH_BIG_LETTERS), completed, {
      sequential: isSequentialProgram(keyboardClub.slug),
    });
    expect(offered.filter((r) => playable.has(r.unit.id))).toEqual([]);
  });

  it("can walk every Word Workshop activity, not just the first", () => {
    const { completed, state } = after(THROUGH_BIG_LETTERS);
    const unit = keyboardClub.units.find((u) => u.id === "word-workshop")!;
    const total = unit.lessons.flatMap((l) => l.activities).length;
    const offered: string[] = [];
    // Bounded by `total` so a recommender that never runs out cannot hang the suite.
    while (offered.length <= total) {
      const rec = nextBest(keyboardClub, state, completed).find(
        (r) => r.unit.id === "word-workshop",
      );
      if (!rec) break;
      offered.push(rec.activity.id);
      completed.add(rec.activity.id);
    }
    expect(offered).toHaveLength(total);
  });
});
