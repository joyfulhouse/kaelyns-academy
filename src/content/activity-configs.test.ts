import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CONFIG_SCHEMAS,
  mathClockConfig,
  mathMoneyConfig,
  mathMeasureConfig,
  oralReadingConfig,
  type ActivityKind,
} from "./activity-configs";
import { journalPromptConfig as journalPromptModuleConfig } from "./activity-configs/journal-prompt";
import { langListenMatchConfig as langListenMatchModuleConfig } from "./activity-configs/lang-listen-match";
import { langSymbolIntroConfig as langSymbolIntroModuleConfig } from "./activity-configs/lang-symbol-intro";
import { mathArrayConfig as mathArrayModuleConfig } from "./activity-configs/math-array";
import { mathClockConfig as mathClockModuleConfig } from "./activity-configs/math-clock";
import { mathFractionBarConfig as mathFractionBarModuleConfig } from "./activity-configs/math-fraction-bar";
import { mathMeasureConfig as mathMeasureModuleConfig } from "./activity-configs/math-measure";
import { mathMoneyConfig as mathMoneyModuleConfig } from "./activity-configs/math-money";
import { mathTenframeConfig as mathTenframeModuleConfig } from "./activity-configs/math-tenframe";
import { oralReadingConfig as oralReadingModuleConfig } from "./activity-configs/oral-reading";
import { phonicsWordbuildConfig as phonicsWordbuildModuleConfig } from "./activity-configs/phonics-wordbuild";
import { readingComprehensionConfig as readingComprehensionModuleConfig } from "./activity-configs/reading-comprehension";
import { seqOrderConfig as seqOrderModuleConfig } from "./activity-configs/seq-order";
import { sightwordGameConfig as sightwordGameModuleConfig } from "./activity-configs/sightword-game";
import { sortCategoriesConfig as sortCategoriesModuleConfig } from "./activity-configs/sort-categories";

const PER_KIND_SCHEMAS = {
  "phonics-wordbuild": phonicsWordbuildModuleConfig,
  "sightword-game": sightwordGameModuleConfig,
  "math-tenframe": mathTenframeModuleConfig,
  "journal-prompt": journalPromptModuleConfig,
  "reading-comprehension": readingComprehensionModuleConfig,
  "math-array": mathArrayModuleConfig,
  "math-fraction-bar": mathFractionBarModuleConfig,
  "lang-symbol-intro": langSymbolIntroModuleConfig,
  "lang-listen-match": langListenMatchModuleConfig,
  "math-clock": mathClockModuleConfig,
  "math-money": mathMoneyModuleConfig,
  "math-measure": mathMeasureModuleConfig,
  "sort-categories": sortCategoriesModuleConfig,
  "seq-order": seqOrderModuleConfig,
  "oral-reading": oralReadingModuleConfig,
} satisfies Record<ActivityKind, (typeof ACTIVITY_CONFIG_SCHEMAS)[ActivityKind]>;

describe("activity config module registry", () => {
  it("maps every activity kind to its one per-kind schema", () => {
    expect(Object.keys(ACTIVITY_CONFIG_SCHEMAS)).toEqual(Object.keys(PER_KIND_SCHEMAS));

    for (const kind of Object.keys(PER_KIND_SCHEMAS) as ActivityKind[]) {
      expect(ACTIVITY_CONFIG_SCHEMAS[kind], kind).toBe(PER_KIND_SCHEMAS[kind]);
    }
  });
});

describe("math-clock config", () => {
  it("accepts a read item to the half-hour", () => {
    expect(
      mathClockConfig.safeParse({
        mode: "read",
        instruction: "What time?",
        hour: 3,
        minute: 30,
        choices: ["3:00", "3:30", "4:00"],
        answerIndex: 1,
      }).success,
    ).toBe(true);
  });
  it("accepts a set item", () => {
    expect(
      mathClockConfig.safeParse({
        mode: "set",
        instruction: "Make 6 o'clock.",
        targetHour: 6,
        targetMinute: 0,
      }).success,
    ).toBe(true);
  });
  it("rejects a minute that isn't 0 or 30, and an out-of-range hour", () => {
    expect(
      mathClockConfig.safeParse({
        mode: "read",
        instruction: "x",
        hour: 3,
        minute: 15,
        choices: ["3:00", "3:15"],
        answerIndex: 0,
      }).success,
    ).toBe(false);
    expect(
      mathClockConfig.safeParse({
        mode: "set",
        instruction: "x",
        targetHour: 13,
        targetMinute: 0,
      }).success,
    ).toBe(false);
  });
});

describe("math-money config", () => {
  it("accepts identify + count items", () => {
    expect(
      mathMoneyConfig.safeParse({
        mode: "identify",
        instruction: "Tap the dime.",
        coins: ["penny", "dime", "nickel"],
        targetCoin: "dime",
      }).success,
    ).toBe(true);
    expect(
      mathMoneyConfig.safeParse({
        mode: "count",
        instruction: "Make 15 cents.",
        palette: ["penny", "nickel", "dime"],
        targetCents: 15,
      }).success,
    ).toBe(true);
  });
  it("rejects an unknown coin and an over-a-dollar target", () => {
    expect(
      mathMoneyConfig.safeParse({
        mode: "identify",
        instruction: "x",
        coins: ["penny", "doubloon"],
        targetCoin: "penny",
      }).success,
    ).toBe(false);
    expect(
      mathMoneyConfig.safeParse({
        mode: "count",
        instruction: "x",
        palette: ["penny"],
        targetCents: 101,
      }).success,
    ).toBe(false);
  });
});

describe("math-measure config", () => {
  it("accepts compare + units items", () => {
    expect(
      mathMeasureConfig.safeParse({
        mode: "compare",
        instruction: "Which is longest?",
        attribute: "length",
        question: "most",
        items: [
          { label: "pencil", emoji: "✏️", size: 3 },
          { label: "crayon", emoji: "🖍️", size: 2 },
        ],
        answerIndex: 0,
      }).success,
    ).toBe(true);
    expect(
      mathMeasureConfig.safeParse({
        mode: "units",
        instruction: "How many cubes?",
        unit: "cube",
        length: 5,
        choices: [4, 5, 6],
        answerIndex: 1,
      }).success,
    ).toBe(true);
  });
  it("rejects an unknown attribute", () => {
    expect(
      mathMeasureConfig.safeParse({
        mode: "compare",
        instruction: "x",
        attribute: "temperature",
        question: "most",
        items: [
          { label: "a", emoji: "a", size: 1 },
          { label: "b", emoji: "b", size: 2 },
        ],
        answerIndex: 0,
      }).success,
    ).toBe(false);
  });
});

describe("oral-reading config", () => {
  it("keeps word/sentence mode orthogonal to cold/listen-repeat presentation", () => {
    const authored = {
      presentation: "listen-repeat" as const,
      instruction: "Listen, then read this word aloud.",
      target: "the",
    };

    expect(oralReadingConfig.parse(authored)).toEqual({ mode: "word", ...authored });
    for (const presentation of ["cold", "listen-repeat"] as const) {
      const sentence = {
        mode: "sentence" as const,
        presentation,
        instruction: "Read the sentence.",
        passage: "We can see the cat.",
      };
      expect(oralReadingConfig.parse(sentence)).toEqual(sentence);
    }
  });

  it("requires authors to choose a presentation instead of silently modeling a cold read", () => {
    expect(
      oralReadingConfig.safeParse({ instruction: "Read.", target: "cat" }).success,
    ).toBe(false);
    expect(
      oralReadingConfig.safeParse({
        mode: "sentence",
        instruction: "Read.",
        passage: "The cat sat.",
      }).success,
    ).toBe(false);
  });

  it("rejects sentence passages above the character or word caps", () => {
    expect(
      oralReadingConfig.safeParse({
        mode: "sentence",
        presentation: "cold",
        instruction: "Read.",
        passage: "a".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      oralReadingConfig.safeParse({
        mode: "sentence",
        presentation: "cold",
        instruction: "Read.",
        passage: Array.from({ length: 41 }, () => "cat").join(" "),
      }).success,
    ).toBe(false);
  });
});
