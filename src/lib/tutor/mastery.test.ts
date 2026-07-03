import { describe, it, expect } from "vitest";
import { applyEvidence, deriveOutcome, isPlaced, outcomeOf, tallyOutcomes, type SkillState } from "./mastery";

describe("deriveOutcome (play, no source — back-compatible)", () => {
  it("no record is not_yet", () => {
    expect(deriveOutcome(undefined)).toBe("not_yet");
  });

  it("empty history is not_yet", () => {
    expect(deriveOutcome({ history: [] })).toBe("not_yet");
  });

  it("a single solid attempt is emerging (one day is not enough)", () => {
    expect(deriveOutcome({ history: [{ day: "2026-06-13", outcome: "solid" }] })).toBe("emerging");
  });

  it("two solids on the SAME day stay emerging", () => {
    expect(
      deriveOutcome({
        history: [
          { day: "2026-06-13", outcome: "solid" },
          { day: "2026-06-13", outcome: "solid" },
        ],
      }),
    ).toBe("emerging");
  });

  it("solid on two DISTINCT days locks to solid", () => {
    expect(
      deriveOutcome({
        history: [
          { day: "2026-06-13", outcome: "solid" },
          { day: "2026-06-14", outcome: "solid" },
        ],
      }),
    ).toBe("solid");
  });
});

describe("deriveOutcome (source-aware, Adventure 2.0 C1)", () => {
  it("a single baseline-sourced solid entry locks to solid (no day-gate wait)", () => {
    expect(
      deriveOutcome({ history: [{ day: "2026-06-20", outcome: "solid", source: "baseline" }] }),
    ).toBe("solid");
  });

  it("play solids on only 1 day still gate to emerging (unchanged)", () => {
    expect(
      deriveOutcome({
        history: [
          { day: "2026-06-20", outcome: "solid", source: "play" },
          { day: "2026-06-20", outcome: "solid", source: "play" },
        ],
      }),
    ).toBe("emerging");
  });

  it("play solids on 2 distinct days still lock to solid (unchanged)", () => {
    expect(
      deriveOutcome({
        history: [
          { day: "2026-06-20", outcome: "solid", source: "play" },
          { day: "2026-06-21", outcome: "solid", source: "play" },
        ],
      }),
    ).toBe("solid");
  });

  it("a baseline solid mixed with a single play solid still locks to solid", () => {
    expect(
      deriveOutcome({
        history: [
          { day: "2026-06-20", outcome: "solid", source: "baseline" },
          { day: "2026-06-21", outcome: "emerging", source: "play" },
        ],
      }),
    ).toBe("solid");
  });
});

describe("isPlaced", () => {
  it("false for undefined", () => {
    expect(isPlaced(undefined)).toBe(false);
  });

  it("false for a play-only record", () => {
    expect(
      isPlaced({
        history: [
          { day: "2026-06-13", outcome: "solid", source: "play" },
          { day: "2026-06-14", outcome: "solid" },
        ],
      }),
    ).toBe(false);
  });

  it("true for a baseline-sourced record", () => {
    expect(isPlaced({ history: [{ day: "2026-06-20", outcome: "solid", source: "baseline" }] })).toBe(
      true,
    );
  });
});

describe("applyEvidence", () => {
  it("folds evidence with no source unchanged (back-compatible)", () => {
    const state: SkillState = {};
    const next = applyEvidence(state, [{ skill: "math.add", outcome: "solid" }], "2026-06-13");
    expect(next["math.add"]!.history).toEqual([{ day: "2026-06-13", outcome: "solid" }]);
  });

  it("stores an explicit source on the folded entry", () => {
    const state: SkillState = {};
    const next = applyEvidence(
      state,
      [{ skill: "math.add", outcome: "solid", source: "baseline" }],
      "2026-06-20",
    );
    expect(next["math.add"]!.history).toEqual([
      { day: "2026-06-20", outcome: "solid", source: "baseline" },
    ]);
  });

  it("does not mutate the input state", () => {
    const state: SkillState = { "math.add": { history: [] } };
    applyEvidence(state, [{ skill: "math.add", outcome: "solid" }], "2026-06-13");
    expect(state["math.add"]!.history).toEqual([]);
  });
});

describe("outcomeOf / tallyOutcomes (unaffected convenience wrappers)", () => {
  it("outcomeOf reads through to deriveOutcome", () => {
    const state: SkillState = { "math.add": { history: [{ day: "2026-06-20", outcome: "solid", source: "baseline" }] } };
    expect(outcomeOf(state, "math.add")).toBe("solid");
  });

  it("tallyOutcomes counts across the given skills", () => {
    const state: SkillState = {
      "math.add": { history: [{ day: "2026-06-20", outcome: "solid", source: "baseline" }] },
      "math.sub": { history: [] },
    };
    expect(tallyOutcomes(state, ["math.add", "math.sub"])).toEqual({
      not_yet: 1,
      emerging: 0,
      solid: 1,
    });
  });
});
