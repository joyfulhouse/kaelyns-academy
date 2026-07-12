import { describe, expect, it } from "vitest";
import {
  attemptMatchesQuest,
  findUnitIdOfActivity,
  foldQuestProgress,
  questActivityHref,
  selectDailyQuests,
  type QuestAttemptCtx,
} from "./logic";

const ctx = (over: Partial<QuestAttemptCtx> = {}): QuestAttemptCtx => ({
  activityId: "act-1",
  unitId: "unit-1",
  skills: ["math.count"],
  generated: false,
  ...over,
});

describe("attemptMatchesQuest", () => {
  it("complete_n matches any authored attempt (generated too — practice counts toward quests)", () => {
    expect(attemptMatchesQuest("complete_n", { count: 3 }, ctx())).toBe(true);
    expect(attemptMatchesQuest("complete_n", { count: 3 }, ctx({ generated: true }))).toBe(true);
  });
  it("try_strand matches only the target unit", () => {
    expect(attemptMatchesQuest("try_strand", { count: 1, unitId: "unit-1" }, ctx())).toBe(true);
    expect(attemptMatchesQuest("try_strand", { count: 1, unitId: "unit-9" }, ctx())).toBe(false);
    expect(attemptMatchesQuest("try_strand", { count: 1, unitId: "unit-1" }, ctx({ unitId: null }))).toBe(false);
  });
  it("practice_skill matches when the attempt exercises the target skill", () => {
    expect(attemptMatchesQuest("practice_skill", { count: 2, skill: "math.count" }, ctx())).toBe(true);
    expect(attemptMatchesQuest("practice_skill", { count: 2, skill: "phonics.cvc" }, ctx())).toBe(false);
  });
});

describe("foldQuestProgress", () => {
  it("increments and completes at count", () => {
    const q = { kind: "complete_n" as const, target: { count: 2 }, progress: { done: 1 } };
    expect(foldQuestProgress(q, ctx())).toEqual({ progress: { done: 2 }, completed: true });
  });
  it("does not increment on a non-match and never exceeds count", () => {
    const miss = { kind: "try_strand" as const, target: { count: 1, unitId: "u9" }, progress: { done: 0 } };
    expect(foldQuestProgress(miss, ctx())).toEqual({ progress: { done: 0 }, completed: false });
    const capped = { kind: "complete_n" as const, target: { count: 2 }, progress: { done: 2 } };
    expect(foldQuestProgress(capped, ctx()).progress.done).toBe(2);
  });
});

describe("selectDailyQuests", () => {
  const templates = [
    { id: "t1", slug: "do-three", title: "Do 3 activities", kind: "complete_n" as const, params: { count: 3 }, rewardStars: 3 },
    { id: "t2", slug: "explore", title: "Explore {focus}", kind: "try_strand" as const, params: {}, rewardStars: 2 },
    { id: "t3", slug: "level-up", title: "Level up {focus}", kind: "practice_skill" as const, params: {}, rewardStars: 2 },
  ];
  it("offers up to 3 quests with resolved targets and titles", () => {
    const drafts = selectDailyQuests(
      templates,
      [{ unitId: "u-read", unitTitle: "Reading River" }],
      ["math.count"],
    );
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toEqual({
      templateId: "t1", kind: "complete_n", title: "Do 3 activities",
      target: { count: 3 }, rewardStars: 3,
    });
    expect(drafts[1]).toEqual({
      templateId: "t2", kind: "try_strand", title: "Explore Reading River",
      target: { count: 1, unitId: "u-read" }, rewardStars: 2,
    });
    expect(drafts[2].target).toEqual({ count: 2, skill: "math.count" });
  });
  it("skips kinds whose inputs are missing (no recs → no try_strand; no emerging → no practice_skill)", () => {
    const drafts = selectDailyQuests(templates, [], []);
    expect(drafts.map((d) => d.kind)).toEqual(["complete_n"]);
  });
  it("skips a template whose params fail its kind schema", () => {
    const bad = [{ ...templates[0], params: { count: 0 } }];
    expect(selectDailyQuests(bad, [], [])).toHaveLength(0);
  });
});

describe("findUnitIdOfActivity", () => {
  it("walks the tree and returns the containing unit id", () => {
    const program = {
      slug: "p", title: "", subtitle: "", ageBand: "", summary: "",
      units: [{
        id: "u1", order: 1, title: "", emoji: "", world: "sunshine", bigIdea: "",
        phonicsFocus: "", mathFocus: "", project: "",
        lessons: [{ id: "l1", order: 1, title: "", activities: [{ id: "a1" }] }],
      }],
    } as never;
    expect(findUnitIdOfActivity(program, "a1")).toBe("u1");
    expect(findUnitIdOfActivity(program, "zz")).toBeNull();
  });
});

describe("questActivityHref", () => {
  const candidates = [
    { href: "/learn/p/reading/a1", unitId: "reading", skills: ["reading.literal"] },
    { href: "/learn/p/math/a2", unitId: "math", skills: ["math.count"] },
    { href: "/learn/p/generated/g1", unitId: "reading", skills: ["reading.fluency"] },
  ];

  it("routes a general completion quest to the top recommendation", () => {
    expect(questActivityHref("complete_n", { count: 3 }, candidates)).toBe(
      "/learn/p/reading/a1",
    );
  });

  it("routes strand and skill quests to a matching recommendation", () => {
    expect(questActivityHref("try_strand", { count: 1, unitId: "math" }, candidates)).toBe(
      "/learn/p/math/a2",
    );
    expect(
      questActivityHref(
        "practice_skill",
        { count: 2, skill: "reading.fluency" },
        candidates,
      ),
    ).toBe("/learn/p/generated/g1");
  });

  it("does not route a targeted quest to an unrelated recommendation", () => {
    expect(questActivityHref("try_strand", { count: 1, unitId: "science" }, candidates)).toBe(
      null,
    );
    expect(
      questActivityHref("practice_skill", { count: 2, skill: "science.observe" }, candidates),
    ).toBeNull();
  });
});
