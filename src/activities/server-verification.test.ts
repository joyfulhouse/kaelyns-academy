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

  it("rejects a schema-valid wrong response from a success-only activity", () => {
    expect(
      parseAndScoreActivity(
        "math-clock",
        { mode: "set", instruction: "Make six o'clock.", targetHour: 6, targetMinute: 0 },
        { attempts: 1, totalMinutes: 390 },
        ["math.time"],
      ),
    ).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("recomputes a complete division fact family before accepting completion", () => {
    const config = {
      instruction: "Share 12 into 3 equal groups, then build its fact family.",
      mode: "divide" as const,
      total: 12,
      groups: 3,
    };
    const response = {
      mode: "divide" as const,
      poolRemaining: 0,
      groupCounts: [4, 4, 4],
      factResults: [12, 12, 4, 4],
      attempts: 1,
    };

    expect(
      parseAndScoreActivity("math-array", config, response, ["math.div.fact-families"]),
    ).toEqual({ ok: false, reason: "invalid-response" });
    expect(
      parseAndScoreActivity(
        "math-array",
        config,
        { ...response, factResults: [12, 12, 4, 3] },
        ["math.div.fact-families"],
      ),
    ).toMatchObject({ ok: true, score: { correct: 1, total: 1 } });
  });

  it("rejects a partially correct final response from a multi-item success-only activity", () => {
    expect(
      parseAndScoreActivity(
        "lang-listen-match",
        {
          locale: "zh-TW",
          instruction: "Listen and choose.",
          skillTags: ["zhuyin.symbols.initials"],
          items: [
            { spoken: "ㄅㄛ", choices: ["ㄅ", "ㄆ"], answerIndex: 0 },
            { spoken: "ㄆㄛ", choices: ["ㄅ", "ㄆ"], answerIndex: 1 },
          ],
        },
        {
          items: [
            { choiceIndex: 0, attempts: 1, usedHelp: false },
            { choiceIndex: 0, attempts: 1, usedHelp: false },
          ],
        },
        ["zhuyin.symbols.initials"],
      ),
    ).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("keeps retry-success scoring when the definition validates final semantics", () => {
    const result = parseAndScoreActivity(
      "reading-comprehension",
      {
        instruction: "Read and answer.",
        passage: "The cat sat.",
        questions: [
          {
            prompt: "Who sat?",
            choices: ["Cat", "Dog"],
            answerIndex: 0,
            kind: "literal",
          },
        ],
      },
      {
        questionResults: [{ questionIndex: 0, choiceIndex: 0, attempts: 2 }],
      },
      [],
    );

    expect(result).toMatchObject({
      ok: true,
      score: { correct: 0, total: 1, stars: 1 },
    });
  });

  it("does not reinterpret oral-reading witness outcomes as client completion claims", () => {
    expect(
      parseAndScoreActivity(
        "oral-reading",
        {
          presentation: "cold",
          instruction: "Read.",
          target: "cat",
          skillTag: "phonics.decode.short-a-cvc",
        },
        { attempts: 1, results: ["unclear"], status: "verified" },
        ["phonics.decode.short-a-cvc"],
      ),
    ).toMatchObject({
      ok: true,
      score: {
        correct: 0,
        total: 1,
        stars: 1,
        skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "not_yet" }],
      },
    });
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
