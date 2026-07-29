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
      "home-base": ["typing.keys.home-row"],
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
      ],
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

  it("uses only teachable characters in every drill and pool", () => {
    for (const { activity } of activities()) {
      const targets =
        activity.kind === "typing-keys"
          ? (activity.config as { keys: string[] }).keys
          : (activity.config as { pool: string[] }).pool;
      for (const target of targets) expect(isTeachableKey(target), target).toBe(true);
    }
  });
});
