import { describe, expect, it } from "vitest";
import type { LangSymbolIntroConfig } from "@/content/activity-configs";
import { worldLanguages } from "@/content/programs/world-languages";
import { responseSchema, schema, score, validateGenerated } from "./logic";

const symbols = [
  {
    id: "zhuyin-b",
    symbol: "ㄅ",
    romanization: "b",
    spoken: "ㄅㄛ",
    audioKey: "zhuyin-b",
  },
  {
    id: "zhuyin-p",
    symbol: "ㄆ",
    romanization: "p",
    spoken: "ㄆㄛ",
    audioKey: "zhuyin-p",
  },
  {
    id: "zhuyin-m",
    symbol: "ㄇ",
    romanization: "m",
    spoken: "ㄇㄛ",
    audioKey: "zhuyin-m",
  },
];

const config: LangSymbolIntroConfig = {
  locale: "zh-TW",
  instruction: "Meet these symbols.",
  skillTags: ["zhuyin.symbols.initials"],
  symbols,
  verify: [
    {
      prompt: "Which symbol says b?",
      spokenPrompt: "Which symbol says b?",
      choices: ["ㄅ", "ㄆ", "ㄇ"],
      answerIndex: 0,
    },
  ],
};

describe("lang-symbol-intro config", () => {
  it("accepts unique inventory symbols and taught verification choices", () => {
    expect(schema.safeParse(config).success).toBe(true);
    expect(validateGenerated(config)).toBeNull();
  });

  it("requires 3-8 unique symbol ids", () => {
    expect(schema.safeParse({ ...config, symbols: symbols.slice(0, 2) }).success).toBe(false);
    expect(
      schema.safeParse({ ...config, symbols: [symbols[0], symbols[1], symbols[0]] }).success,
    ).toBe(false);
  });

  it("rejects duplicate, untaught, and out-of-range verification choices", () => {
    expect(
      schema.safeParse({
        ...config,
        verify: [{ ...config.verify[0], choices: ["ㄅ", "ㄅ"] }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...config,
        verify: [{ ...config.verify[0], choices: ["ㄅ", "ㄆ", "ㄈ"] }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...config,
        verify: [{ ...config.verify[0], answerIndex: 3 }],
      }).success,
    ).toBe(false);
  });

  it("rejects invented inventory facts and missing spoken verification prompts", () => {
    expect(
      validateGenerated({
        ...config,
        symbols: [{ ...symbols[0], id: "invented" }, symbols[1], symbols[2]],
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        symbols: [{ ...symbols[0], spoken: "wrong" }, symbols[1], symbols[2]],
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        verify: [{ ...config.verify[0], spokenPrompt: undefined }],
      }),
    ).not.toBeNull();
  });

  it("keeps every authored symbol introduction inside its exact inventory", () => {
    for (const unit of worldLanguages.units) {
      for (const lesson of unit.lessons) {
        for (const activity of lesson.activities) {
          if (activity.kind !== "lang-symbol-intro") continue;
          expect(validateGenerated(activity.config), activity.id).toBeNull();
        }
      }
    }
  });
});

describe("lang-symbol-intro response and score", () => {
  const response = {
    exposures: symbols.map((symbol) => ({
      symbolId: symbol.id,
      activated: true,
      heardExample: false,
      usedHelp: false,
    })),
    checks: [{ choiceIndex: 0, attempts: 1 }],
  };

  it("accepts only bounded exposure and verification summaries", () => {
    expect(responseSchema.safeParse(response).success).toBe(true);
    expect(responseSchema.safeParse({ ...response, transcript: "child text" }).success).toBe(
      false,
    );
    expect(
      responseSchema.safeParse({
        ...response,
        exposures: Array.from({ length: 9 }, (_, index) => ({
          symbolId: `symbol-${index}`,
          activated: true,
          heardExample: false,
          usedHelp: false,
        })),
      }).success,
    ).toBe(false);
  });

  it("scores genuine first-try exposure and verification as solid", () => {
    expect(score(config, response)).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "zhuyin.symbols.initials", outcome: "solid" }],
    });
  });

  it("caps independence when pronunciation help revealed an answer support", () => {
    const result = score(config, {
      ...response,
      exposures: response.exposures.map((entry, index) =>
        index === 0 ? { ...entry, usedHelp: true } : entry,
      ),
    });

    expect(result).toMatchObject({ correct: 1, total: 1, stars: 2 });
    expect(result.skillEvidence[0]?.outcome).toBe("emerging");
  });

  it("rejects partial, duplicate, inactive, extra, and out-of-range evidence", () => {
    expect(() => score(config, { ...response, exposures: response.exposures.slice(0, 2) })).toThrow(
      /one exposure/i,
    );
    expect(() =>
      score(config, {
        ...response,
        exposures: [response.exposures[0], response.exposures[0], response.exposures[2]],
      }),
    ).toThrow(/unique/i);
    expect(() =>
      score(config, {
        ...response,
        exposures: response.exposures.map((entry, index) =>
          index === 0 ? { ...entry, activated: false } : entry,
        ),
      }),
    ).toThrow(/activated/i);
    expect(() => score(config, { ...response, checks: [] })).toThrow(/one check/i);
    expect(() =>
      score(config, { ...response, checks: [{ choiceIndex: 3, attempts: 1 }] }),
    ).toThrow(/choice index/i);
  });
});
