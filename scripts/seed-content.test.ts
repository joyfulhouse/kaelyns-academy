import { describe, expect, it } from "vitest";
import { buildSeedPlan, findDuplicateProgramActivityKey } from "./seed-content";
import { listPrograms, SKILLS } from "@/content";
import type { Activity, Program } from "@/content/types";

describe("buildSeedPlan", () => {
  const plan = buildSeedPlan(listPrograms(), SKILLS);
  it("emits one program + one published v1 per static program", () => {
    expect(plan.programs.length).toBe(listPrograms().length);
    expect(plan.versions.every((v) => v.version === 1 && v.status === "published")).toBe(true);
  });
  it("preserves authored ids as stable keys (activityKey == authored activity.id)", () => {
    const a = listPrograms()[0].units[0].lessons[0].activities[0];
    expect(plan.activities.some((r) => r.activityKey === a.id)).toBe(true);
  });
  it("maps every skill", () => { expect(plan.skills.length).toBe(SKILLS.length); });
  it("orders siblings with lexically-sortable orderKeys matching authored order", () => {
    const u = plan.units.filter((r) => r.programVersionKey === plan.versions[0].key);
    const sorted = [...u].sort((x, y) => x.orderKey.localeCompare(y.orderKey));
    expect(sorted.map((r) => r.unitKey)).toEqual(u.map((r) => r.unitKey));
  });
});

// ── program-wide activityKey uniqueness (Fix-E Layer 1 addendum) ───────────────

/** A minimal valid activity with a given id (config is not validated by the seed). */
function act(id: string): Activity {
  return {
    id,
    kind: "math-tenframe",
    title: id,
    band: "ready",
    skillTags: [],
    config: { instruction: "Count", mode: "represent", target: 3 },
  } as Activity;
}

/** A program whose two lessons (in different units) reuse the activity id "dup". */
function programWithDupActivityKey(): Program {
  return {
    slug: "broken",
    title: "Broken",
    subtitle: "",
    ageBand: "",
    summary: "",
    units: [
      {
        id: "u1",
        order: 1,
        title: "U1",
        emoji: "",
        world: "sunshine",
        bigIdea: "",
        phonicsFocus: "",
        mathFocus: "",
        project: "",
        lessons: [{ id: "l1", order: 1, title: "L1", activities: [act("dup")] }],
      },
      {
        id: "u2",
        order: 2,
        title: "U2",
        emoji: "",
        world: "garden",
        bigIdea: "",
        phonicsFocus: "",
        mathFocus: "",
        project: "",
        lessons: [{ id: "l2", order: 1, title: "L2", activities: [act("dup")] }],
      },
    ],
  };
}

describe("findDuplicateProgramActivityKey", () => {
  it("returns null for every shipped static program (the authored convention is sound)", () => {
    for (const prog of listPrograms()) {
      expect(findDuplicateProgramActivityKey(prog)).toBeNull();
    }
  });

  it("returns the first activityKey reused across lessons/units", () => {
    expect(findDuplicateProgramActivityKey(programWithDupActivityKey())).toBe("dup");
  });
});

describe("buildSeedPlan (program-wide activityKey guard)", () => {
  it("throws on a program with a duplicate program-wide activityKey", () => {
    expect(() => buildSeedPlan([programWithDupActivityKey()], SKILLS)).toThrow(
      /duplicate program-wide activityKey: "dup"/,
    );
  });
});
