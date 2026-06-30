import { describe, expect, it } from "vitest";
import {
  activityIdsForProgram,
  findActivity,
  flatActivities,
  forEachActivity,
  programStats,
} from "./index";
import type { Activity, Program } from "./types";

// A tiny synthetic program: two units, the second with an EMPTY lesson, so the
// walkers' handling of empty levels is exercised independently of authored content.
function activity(id: string): Activity {
  return {
    id,
    kind: "sightword-game",
    title: id,
    band: "ready",
    skillTags: [],
    config: { instruction: "", words: ["the", "and"], decoys: [] },
  };
}

const program: Program = {
  slug: "fixture",
  title: "Fixture",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [
    {
      id: "u1",
      order: 1,
      title: "Unit 1",
      emoji: "",
      world: "sunshine",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [
        { id: "l1", order: 1, title: "L1", activities: [activity("a1"), activity("a2")] },
        { id: "l2", order: 2, title: "L2", activities: [activity("a3")] },
      ],
    },
    {
      id: "u2",
      order: 2,
      title: "Unit 2",
      emoji: "",
      world: "ocean",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [{ id: "l3", order: 1, title: "L3 (empty)", activities: [] }],
    },
  ],
};

describe("forEachActivity", () => {
  it("visits every activity in authored order with its unit and lesson", () => {
    const seen: string[] = [];
    const context: Record<string, [string, string]> = {};
    forEachActivity(program, ({ unit, lesson, activity }) => {
      seen.push(activity.id);
      context[activity.id] = [unit.id, lesson.id];
    });
    expect(seen).toEqual(["a1", "a2", "a3"]);
    expect(context.a1).toEqual(["u1", "l1"]);
    expect(context.a3).toEqual(["u1", "l2"]);
  });

  it("does not invoke the callback for a lesson with no activities", () => {
    let calls = 0;
    forEachActivity(program, () => {
      calls += 1;
    });
    expect(calls).toBe(3); // the empty lesson l3 contributes nothing
  });
});

describe("flatActivities", () => {
  it("returns every activity context in order", () => {
    expect(flatActivities(program).map(({ activity }) => activity.id)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
  });
});

describe("findActivity", () => {
  it("locates an activity with its unit and lesson", () => {
    const found = findActivity(program, "a3");
    expect(found?.unit.id).toBe("u1");
    expect(found?.lesson.id).toBe("l2");
    expect(found?.activity.id).toBe("a3");
  });

  it("returns undefined for an unknown id", () => {
    expect(findActivity(program, "nope")).toBeUndefined();
  });
});

describe("programStats", () => {
  it("counts units, lessons (incl. empty), and activities", () => {
    expect(programStats(program)).toEqual({ units: 2, lessons: 3, activities: 3 });
  });
});

describe("activityIdsForProgram", () => {
  it("lists every authored activity id", () => {
    expect(activityIdsForProgram(program)).toEqual(["a1", "a2", "a3"]);
  });
});
