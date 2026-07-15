import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerActivityType } from "./definitions";
import { parseAndScoreActivity } from "./server-verification";

describe("parseAndScoreActivity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses config and response before returning a canonical score", () => {
    const result = parseAndScoreActivity(
      "math-tenframe",
      { instruction: "Show 3.", mode: "represent", target: 3 },
      { count: 3, attempts: 1 },
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
      response: { count: 3, attempts: 1 },
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
        { count: 3, attempts: 1 },
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
          count: 3,
          attempts: 1,
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
        { count: 5, attempts: 1 },
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
        { count: 3, attempts: 1 },
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
        { count: 3, attempts: 1 },
        ["math.counting"],
      ),
    ).toEqual({ ok: false, reason: "invalid-score" });
  });
});
