import { describe, expect, it } from "vitest";
import { getServerActivityType } from "@/activities/definitions";
import { exactSkillRoutingIssue } from "@/activities/skill-routing";
import { keyboardClub } from "../keyboard-club";
import { isTeachableKey } from "@/activities/_shared/typing/keys";
import type { ActivityKind } from "@/content/activity-configs";

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
