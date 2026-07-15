import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerActivityType } from "./definitions";
import { parseAndScoreActivity } from "./server-verification";

const REPRESENT_THREE = {
  mode: "represent" as const,
  occupiedCells: [0, 1, 2],
  placements: [0, 1, 2],
  attempts: 1,
};

describe("parseAndScoreActivity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses config and response before returning a canonical score", () => {
    const result = parseAndScoreActivity(
      "math-tenframe",
      { instruction: "Show 3.", mode: "represent", target: 3 },
      REPRESENT_THREE,
      ["math.counting"],
    );

    expect(result).toEqual({
      ok: true,
      config: {
        instruction: "Show 3.",
        mode: "represent",
        target: 3,
        frames: 1,
      },
      response: REPRESENT_THREE,
      score: {
        correct: 1,
        total: 1,
        stars: 3,
        skillEvidence: [{ skill: "math.counting", outcome: "solid" }],
      },
    });
  });

  it("fails closed on malformed config", () => {
    expect(
      parseAndScoreActivity(
        "math-tenframe",
        { instruction: "Show 3.", mode: "represent", target: 300 },
        REPRESENT_THREE,
        ["math.counting"],
      ),
    ).toEqual({ ok: false, reason: "invalid-config" });
  });

  it("fails closed on malformed or client-authored scoring response fields", () => {
    expect(
      parseAndScoreActivity(
        "math-tenframe",
        { instruction: "Show 3.", mode: "represent", target: 3 },
        {
          ...REPRESENT_THREE,
          stars: 3,
          skillEvidence: [{ skill: "forged.skill", outcome: "solid" }],
        },
        ["math.counting"],
      ),
    ).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("rejects derived skills outside the authoritative activity tags", () => {
    expect(
      parseAndScoreActivity(
        "math-tenframe",
        { instruction: "Add 2.", mode: "add", target: 3, addend: 2 },
        {
          mode: "add",
          occupiedCells: [0, 1, 2, 3, 4],
          placements: [3, 4],
          attempts: 1,
        },
        ["math.addition"],
      ),
    ).toEqual({ ok: false, reason: "unauthorized-skill" });
  });

  it("rejects score evidence outside the authoritative activity tags", () => {
    const definition = getServerActivityType("math-tenframe");
    vi.spyOn(definition, "score").mockReturnValue({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "forged.skill", outcome: "solid" }],
    });

    expect(
      parseAndScoreActivity(
        "math-tenframe",
        { instruction: "Show 3.", mode: "represent", target: 3 },
        REPRESENT_THREE,
        ["math.counting"],
      ),
    ).toEqual({ ok: false, reason: "unauthorized-skill" });
  });

  it("rejects an invalid score returned by plugin logic", () => {
    const definition = getServerActivityType("math-tenframe");
    vi.spyOn(definition, "score").mockReturnValue({
      correct: 2,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.counting", outcome: "solid" }],
    });

    expect(
      parseAndScoreActivity(
        "math-tenframe",
        { instruction: "Show 3.", mode: "represent", target: 3 },
        REPRESENT_THREE,
        ["math.counting"],
      ),
    ).toEqual({ ok: false, reason: "invalid-score" });
  });
});
