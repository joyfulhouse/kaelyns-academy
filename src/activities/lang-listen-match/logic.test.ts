import { describe, expect, it } from "vitest";
import type { LangListenMatchConfig } from "@/content/activity-configs";
import { worldLanguages } from "@/content/programs/world-languages";
import { responseSchema, score, validateGenerated } from "./logic";

const config: LangListenMatchConfig = {
  locale: "zh-TW",
  instruction: "Listen and choose.",
  skillTags: ["zhuyin.symbols.initials"],
  items: [
    {
      spoken: "ㄅㄛ",
      audioKey: "zhuyin-b",
      choices: ["ㄅ", "ㄆ"],
      choiceLabels: ["b", "p"],
      answerIndex: 0,
    },
    {
      spoken: "ㄆㄛ",
      audioKey: "zhuyin-p",
      choices: ["ㄅ", "ㄆ"],
      choiceLabels: ["b", "p"],
      answerIndex: 1,
    },
  ],
};

describe("lang-listen-match config", () => {
  it("accepts unique choices with aligned optional labels", () => {
    expect(validateGenerated(config)).toBeNull();
  });

  it("rejects duplicate choices, mismatched labels, and out-of-range answers", () => {
    expect(
      validateGenerated({
        ...config,
        items: [{ ...config.items[0], choices: ["ㄅ", "ㄅ"] }],
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        items: [{ ...config.items[0], choiceLabels: ["b"] }],
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        items: [{ ...config.items[0], answerIndex: 2 }],
      }),
    ).not.toBeNull();
  });

  it("rejects invented inventory glyphs and noncanonical heard fields", () => {
    expect(
      validateGenerated({
        ...config,
        items: [{ ...config.items[0], choices: ["ㄅ", "B"] }],
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        items: [{ ...config.items[0], spoken: "wrong" }],
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({
        ...config,
        items: [{ ...config.items[0], audioKey: "wrong" }],
      }),
    ).not.toBeNull();
  });

  it("keeps every authored listening activity inside its exact inventory", () => {
    for (const unit of worldLanguages.units) {
      for (const lesson of unit.lessons) {
        for (const activity of lesson.activities) {
          if (activity.kind !== "lang-listen-match") continue;
          expect(validateGenerated(activity.config), activity.id).toBeNull();
        }
      }
    }
  });
});

describe("lang-listen-match response and score", () => {
  it("accepts only bounded final choices, attempts, and support flags", () => {
    const response = {
      items: [
        { choiceIndex: 0, attempts: 1, usedHelp: false },
        { choiceIndex: 1, attempts: 2, usedHelp: true },
      ],
    };
    expect(responseSchema.safeParse(response).success).toBe(true);
    expect(
      responseSchema.safeParse({ ...response, score: { stars: 3 } }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        items: [{ choiceIndex: 0, attempts: 21, usedHelp: false }],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        items: Array.from({ length: 13 }, () => ({
          choiceIndex: 0,
          attempts: 1,
          usedHelp: false,
        })),
      }).success,
    ).toBe(false);
  });

  it("scores complete first-try listening as solid", () => {
    expect(
      score(config, {
        items: [
          { choiceIndex: 0, attempts: 1, usedHelp: false },
          { choiceIndex: 1, attempts: 1, usedHelp: false },
        ],
      }),
    ).toEqual({
      correct: 2,
      total: 2,
      stars: 3,
      skillEvidence: [{ skill: "zhuyin.symbols.initials", outcome: "solid" }],
    });
  });

  it("keeps supported retry success truthful", () => {
    const result = score(config, {
      items: [
        { choiceIndex: 0, attempts: 2, usedHelp: false },
        { choiceIndex: 1, attempts: 1, usedHelp: true },
      ],
    });

    expect(result).toMatchObject({ correct: 2, total: 2, stars: 2 });
    expect(result.skillEvidence[0]?.outcome).toBe("emerging");
  });

  it("rejects partial, extra, and per-item out-of-range results", () => {
    expect(() =>
      score(config, {
        items: [{ choiceIndex: 0, attempts: 1, usedHelp: false }],
      }),
    ).toThrow(/one result per listening item/i);

    expect(() =>
      score(config, {
        items: [
          { choiceIndex: 0, attempts: 1, usedHelp: false },
          { choiceIndex: 1, attempts: 1, usedHelp: false },
          { choiceIndex: 0, attempts: 1, usedHelp: false },
        ],
      }),
    ).toThrow(/one result per listening item/i);

    expect(() =>
      score(config, {
        items: [
          { choiceIndex: 2, attempts: 1, usedHelp: false },
          { choiceIndex: 1, attempts: 1, usedHelp: false },
        ],
      }),
    ).toThrow(/choice index/i);
  });
});
