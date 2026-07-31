import { describe, it, expect } from "vitest";
import type { Activity, Program, SkillTag } from "@/content";
import { applyEvidence, deriveOutcome, outcomeOf, tallyOutcomes, type SkillState } from "./mastery";
import { nextBest, strandProgress, unitSkills } from "./recommend";

function act(id: string, skillTags: SkillTag[]): Activity {
  return {
    id,
    kind: "math-tenframe",
    title: id,
    band: "ready",
    skillTags,
    config: { instruction: "Show one.", mode: "represent", target: 1, frames: 1 },
  };
}

function journal(id: string, skillTags: SkillTag[] = []): Activity {
  return {
    id,
    kind: "journal-prompt",
    title: id,
    band: "ready",
    skillTags,
    config: { prompt: "Tell one idea.", drawing: false, mode: "compose" },
  };
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

  /** Two strands, so a satisfied one can be ranked against a pending one. */
  const twoUnits = (
    u1: Program["units"][number]["lessons"],
    u2: Program["units"][number]["lessons"],
  ): Program => ({
    slug: "shared",
    title: "Shared",
    subtitle: "",
    ageBand: "",
    summary: "",
    units: [
      { id: "u1", order: 1, title: "Reading", emoji: "📖", world: "sunshine",
        bigIdea: "", phonicsFocus: "", mathFocus: "", project: "", lessons: u1 },
      { id: "u2", order: 2, title: "Math", emoji: "🔢", world: "bigtop",
        bigIdea: "", phonicsFocus: "", mathFocus: "", project: "", lessons: u2 },
    ],
  });

  // Mastery may spare her a grind; it must not make content invisible. A unit
  // whose skills are all taught upstream would otherwise read complete and
  // vanish from every offer without her ever seeing it — which is exactly how
  // Keyboard Club's Word Workshop and Star Echo lesson shipped.
  it("still offers a satisfied strand that holds activities she has never played", () => {
    let s: SkillState = {};
    // "shared.x" is taught in u1 and is the ONLY skill u2 claims, so finishing
    // u1 marks u2 complete before it is touched.
    const shared = twoUnits(
      [{ id: "u1l1", order: 1, title: "R1", activities: [act("u1l1a1", ["shared.x"])] }],
      [
        { id: "u2l1", order: 1, title: "M1", activities: [act("u2l1a1", ["shared.x"])] },
        { id: "u2l2", order: 2, title: "M2", activities: [act("u2l2a1", ["shared.x"])] },
      ],
    );
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(s, [{ skill: "shared.x", outcome: "solid" }], day);
    }
    const recs = nextBest(shared, s, new Set(["u1l1a1"]));
    const second = recs.find((r) => r.unit.id === "u2");
    expect(second?.activity.id).toBe("u2l1a1");
    expect(second?.isPractice).toBe(false);
    expect(second?.reason).toMatch(/Something new/);
  });

  it("walks a satisfied strand through the rest of its activities", () => {
    let s: SkillState = {};
    const shared = twoUnits(
      [{ id: "u1l1", order: 1, title: "R1", activities: [act("u1l1a1", ["shared.x"])] }],
      [
        { id: "u2l1", order: 1, title: "M1", activities: [act("u2l1a1", ["shared.x"])] },
        { id: "u2l2", order: 2, title: "M2", activities: [act("u2l2a1", ["shared.x"])] },
      ],
    );
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(s, [{ skill: "shared.x", outcome: "solid" }], day);
    }
    const done = new Set(["u1l1a1", "u2l1a1"]);
    expect(nextBest(shared, s, done).find((r) => r.unit.id === "u2")?.activity.id).toBe("u2l2a1");
    done.add("u2l2a1");
    // Nothing left unplayed — now it really is finished and drops out again.
    expect(nextBest(shared, s, done).some((r) => r.unit.id === "u2")).toBe(false);
  });

  // A check-in's attempts route to checkpoint_result instead of skill_state, so
  // its evidence is a cold placement read a grown-up schedules — not content to
  // fill a gap with. Offering one post-mastery would spend the instrument on a
  // child already taught the material and raise a pending placement row nobody
  // asked for. getDueReviews and ensureLessonPractice exclude them for the same
  // reason.
  it("never offers a checkpoint unit as something new once its skills are solid", () => {
    let s: SkillState = {};
    const withCheckIn = twoUnits(
      [{ id: "u1l1", order: 1, title: "R1", activities: [act("u1l1a1", ["shared.x"])] }],
      [{ id: "u2l1", order: 1, title: "M1", activities: [act("u2l1a1", ["shared.x"])] }],
    );
    withCheckIn.units[1].checkpoint = "baseline";
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(s, [{ skill: "shared.x", outcome: "solid" }], day);
    }
    const recs = nextBest(withCheckIn, s, new Set(["u1l1a1"]));
    expect(recs.some((r) => r.unit.id === "u2")).toBe(false);
  });

  // An authored lesson with no activities has no skills and no journals, so it
  // has no gate to meet: lessonIsComplete stays false and it pins itself as
  // currentLesson forever, while strandNext finds nothing there to offer. The
  // rest of the unit must stay visible behind that dead rung.
  it("sees past a lesson with no activities instead of losing the unit", () => {
    const withDeadRung = twoUnits(
      [{ id: "u1l1", order: 1, title: "R1", activities: [act("u1l1a1", ["rs.a"])] }],
      [
        { id: "u2l0", order: 1, title: "Empty", activities: [] },
        { id: "u2l1", order: 2, title: "M1", activities: [act("u2l1a1", ["ms.a"])] },
      ],
    );
    const recs = nextBest(withDeadRung, {}, new Set());
    expect(recs.find((r) => r.unit.id === "u2")?.activity.id).toBe("u2l1a1");
  });

  it("ranks a satisfied strand behind every strand with work still pending", () => {
    let s: SkillState = {};
    const shared = twoUnits(
      [{ id: "u1l1", order: 1, title: "R1", activities: [act("u1l1a1", ["shared.x"])] }],
      [
        { id: "u2l1", order: 1, title: "M1", activities: [act("u2l1a1", ["shared.x"])] },
        { id: "u2l2", order: 2, title: "M2", activities: [act("u2l2a1", ["shared.x"])] },
      ],
    );
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(s, [{ skill: "shared.x", outcome: "solid" }], day);
    }
    // u1 has an unmet gate (a second, unsolid skill); u2 is satisfied. Even
    // though u2 has fewer completions, the pending strand must lead.
    const withPending = {
      ...shared,
      units: [
        {
          ...shared.units[0],
          lessons: [
            ...shared.units[0].lessons,
            { id: "u1l2", order: 2, title: "R2", activities: [act("u1l2a1", ["rs.pending"])] },
          ],
        },
        shared.units[1],
      ],
    };
    const recs = nextBest(withPending, s, new Set(["u1l1a1"]));
    expect(recs[0].unit.id).toBe("u1");
    expect(recs[recs.length - 1].unit.id).toBe("u2");
  });

  it("keeps an incomplete journal rung current without changing skill state", () => {
    const state: SkillState = {};
    const journalProgram = programWithLessons([
      { id: "journal-1", order: 1, title: "First idea", activities: [journal("journal-a1", ["writing.compose.sentence"])] },
      { id: "journal-2", order: 2, title: "Next idea", activities: [journal("journal-a2", ["writing.compose.paragraph"])] },
    ]);

    const [progress] = strandProgress(journalProgram, state);

    expect(progress.currentLesson?.id).toBe("journal-1");
    expect(progress.ratio).toBe(0);
    expect(state).toEqual({});
  });

  it("advances a journal-only strand by completion while mastery stays unchanged", () => {
    const state: SkillState = {};
    const journalProgram = programWithLessons([
      { id: "journal-1", order: 1, title: "First idea", activities: [journal("journal-a1", ["writing.compose.sentence"])] },
      { id: "journal-2", order: 2, title: "Next idea", activities: [journal("journal-a2", ["writing.compose.paragraph"])] },
    ]);

    const [progress] = strandProgress(journalProgram, state, new Set(["journal-a1"]));
    const recommendations = nextBest(journalProgram, state, new Set(["journal-a1"]));

    expect(progress.currentLesson?.id).toBe("journal-2");
    expect(progress.currentLessonIndex).toBe(2);
    expect(progress.solidSkills).toBe(0);
    expect(progress.totalSkills).toBe(0);
    expect(progress.ratio).toBe(0.5);
    expect(recommendations[0]?.activity.id).toBe("journal-a2");
    expect(state).toEqual({});
  });

  it("reports a completed journal-only strand as complete", () => {
    const journalProgram = programWithLessons([
      { id: "journal-1", order: 1, title: "First idea", activities: [journal("journal-a1")] },
      { id: "journal-2", order: 2, title: "Next idea", activities: [journal("journal-a2")] },
    ]);

    const [progress] = strandProgress(
      journalProgram,
      {},
      new Set(["journal-a1", "journal-a2"]),
    );

    expect(progress.currentLesson).toBeNull();
    expect(progress.ratio).toBe(1);
  });

  it("requires both assessed mastery and journal completion in a mixed lesson", () => {
    const mixedProgram = programWithLessons([
      {
        id: "mixed",
        order: 1,
        title: "Learn and reflect",
        activities: [act("math-a1", ["math.count"]), journal("journal-a1")],
      },
    ]);
    let solid: SkillState = {};
    for (const day of ["d1", "d2"]) {
      solid = applyEvidence(solid, [{ skill: "math.count", outcome: "solid" }], day);
    }

    expect(strandProgress(mixedProgram, {}, new Set(["journal-a1"]))[0].currentLesson?.id).toBe("mixed");
    expect(strandProgress(mixedProgram, solid, new Set())[0].currentLesson?.id).toBe("mixed");
    expect(strandProgress(mixedProgram, solid, new Set(["journal-a1"]))[0].currentLesson).toBeNull();
  });
});

function programWithLessons(
  lessons: Program["units"][number]["lessons"],
): Program {
  return {
    slug: "journals",
    title: "Journals",
    subtitle: "",
    ageBand: "",
    summary: "",
    units: [
      {
        id: "writing",
        order: 1,
        title: "Writing",
        emoji: "✏️",
        world: "space",
        bigIdea: "",
        phonicsFocus: "",
        mathFocus: "",
        project: "",
        lessons,
      },
    ],
  };
}
