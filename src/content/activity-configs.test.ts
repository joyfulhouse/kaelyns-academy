import { describe, expect, it } from "vitest";
import {
  mathClockConfig,
  mathMoneyConfig,
  mathMeasureConfig,
} from "./activity-configs";

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
