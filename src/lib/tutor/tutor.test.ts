import { describe, it, expect } from "vitest";
import type { Activity, Program, SkillTag } from "@/content";
import { applyEvidence, deriveOutcome, outcomeOf, tallyOutcomes, type SkillState } from "./mastery";
import { nextBest, strandProgress, unitSkills } from "./recommend";

function act(id: string, skillTags: SkillTag[]): Activity {
  return { id, kind: "journal-prompt", title: id, band: "ready", skillTags, config: { prompt: "x" } };
}

const program: Program = {
  slug: "t",
  title: "T",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [
    {
      id: "u1", order: 1, title: "Reading", emoji: "📖", world: "sunshine",
      bigIdea: "", phonicsFocus: "", mathFocus: "", project: "",
      lessons: [
        { id: "u1l1", order: 1, title: "R1", activities: [act("u1l1a1", ["rs.a"]), act("u1l1a2", ["rs.b"])] },
        { id: "u1l2", order: 2, title: "R2", activities: [act("u1l2a1", ["rs.c"])] },
      ],
    },
    {
      id: "u2", order: 1, title: "Math", emoji: "🔢", world: "bigtop",
      bigIdea: "", phonicsFocus: "", mathFocus: "", project: "",
      lessons: [{ id: "u2l1", order: 1, title: "M1", activities: [act("u2l1a1", ["ms.a"])] }],
    },
  ],
};

describe("mastery gate", () => {
  it("not_yet with no history, emerging after one solid day", () => {
    expect(deriveOutcome(undefined)).toBe("not_yet");
    expect(deriveOutcome({ history: [{ day: "d1", outcome: "solid" }] })).toBe("emerging");
    expect(deriveOutcome({ history: [{ day: "d1", outcome: "emerging" }] })).toBe("emerging");
  });

  it("solid only after success on >= 2 distinct days", () => {
    expect(deriveOutcome({ history: [{ day: "d1", outcome: "solid" }, { day: "d1", outcome: "solid" }] })).toBe("emerging");
    expect(deriveOutcome({ history: [{ day: "d1", outcome: "solid" }, { day: "d2", outcome: "solid" }] })).toBe("solid");
  });

  it("applyEvidence accumulates immutably and stamps the day", () => {
    const s0: SkillState = {};
    const s1 = applyEvidence(s0, [{ skill: "rs.a", outcome: "solid" }], "d1");
    const s2 = applyEvidence(s1, [{ skill: "rs.a", outcome: "solid" }], "d2");
    expect(s0).toEqual({});
    expect(outcomeOf(s2, "rs.a")).toBe("solid");
    expect(outcomeOf(s1, "rs.a")).toBe("emerging");
  });

  it("tallies outcomes across a skill set", () => {
    let s: SkillState = {};
    s = applyEvidence(s, [{ skill: "rs.a", outcome: "solid" }], "d1");
    s = applyEvidence(s, [{ skill: "rs.a", outcome: "solid" }], "d2");
    s = applyEvidence(s, [{ skill: "rs.b", outcome: "emerging" }], "d1");
    expect(tallyOutcomes(s, ["rs.a", "rs.b", "rs.c"])).toEqual({ solid: 1, emerging: 1, not_yet: 1 });
  });
});

describe("recommender", () => {
  const empty: SkillState = {};

  it("unitSkills lists tags in ladder order", () => {
    expect(unitSkills(program.units[0])).toEqual(["rs.a", "rs.b", "rs.c"]);
  });

  it("current rung is the first lesson not fully solid", () => {
    const sp = strandProgress(program, empty);
    expect(sp[0].currentLesson?.id).toBe("u1l1");
    expect(sp[0].currentLessonIndex).toBe(1);
    expect(sp[0].ratio).toBe(0);
  });

  it("advances the current rung once its skills are solid", () => {
    let s: SkillState = {};
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(s, [{ skill: "rs.a", outcome: "solid" }, { skill: "rs.b", outcome: "solid" }], day);
    }
    const sp = strandProgress(program, s);
    expect(sp[0].currentLesson?.id).toBe("u1l2"); // R1 solid → rung 2
    expect(sp[0].currentLessonIndex).toBe(2);
  });

  it("nextBest returns the first uncompleted activity per strand, breadth-first", () => {
    const recs = nextBest(program, empty, new Set());
    // both strands have 0 completed → tie broken by iteration order (reading first)
    expect(recs.map((r) => r.activity.id)).toEqual(["u1l1a1", "u2l1a1"]);
    expect(recs[0].isPractice).toBe(false);
  });

  it("ranks the less-practiced strand first", () => {
    // complete both reading rung-1 activities → reading has 2 done, math 0
    const recs = nextBest(program, empty, new Set(["u1l1a1", "u1l1a2"]));
    expect(recs[0].unit.id).toBe("u2"); // math (0 done) surfaces first
  });

  it("recommends practice when a rung is done but not yet solid", () => {
    // all reading rung-1 activities completed, but skills only emerging (1 day)
    let s: SkillState = {};
    s = applyEvidence(s, [{ skill: "rs.a", outcome: "solid" }, { skill: "rs.b", outcome: "solid" }], "d1");
    const recs = nextBest(program, s, new Set(["u1l1a1", "u1l1a2"]));
    const reading = recs.find((r) => r.unit.id === "u1");
    expect(reading?.isPractice).toBe(true);
  });

  it("drops a strand from recommendations once fully solid", () => {
    let s: SkillState = {};
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(s, [{ skill: "ms.a", outcome: "solid" }], day);
    }
    const recs = nextBest(program, s, new Set(["u2l1a1"]));
    expect(recs.some((r) => r.unit.id === "u2")).toBe(false);
  });
});
