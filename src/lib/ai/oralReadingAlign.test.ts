import { describe, expect, it } from "vitest";
import { oralReadingAlign } from "./oralReadingAlign";

describe("oralReadingAlign", () => {
  it("matches a complete passage and computes WCPM from matched timestamps", () => {
    expect(
      oralReadingAlign("We can see the cat.", [
        { word: "we", start: 0, end: 0.5 },
        { word: "can", start: 0.5, end: 1 },
        { word: "see", start: 1, end: 1.5 },
        { word: "the", start: 1.5, end: 2 },
        { word: "cat", start: 2, end: 3 },
      ]),
    ).toEqual({
      result: "matched",
      perWord: [
        { state: "correct" },
        { state: "correct" },
        { state: "correct" },
        { state: "correct" },
        { state: "correct" },
      ],
      wcpm: 100,
      correctCount: 5,
      totalWords: 5,
    });
  });

  it("marks one missed target word unclear while preserving later matches", () => {
    expect(
      oralReadingAlign("We can see the cat.", [
        { word: "we", start: 0, end: 0.5 },
        { word: "can", start: 0.5, end: 1 },
        { word: "the", start: 1, end: 1.5 },
        { word: "cat", start: 1.5, end: 2.4 },
      ]),
    ).toEqual({
      result: "unclear",
      perWord: [
        { state: "correct" },
        { state: "correct" },
        { state: "unclear" },
        { state: "correct" },
        { state: "correct" },
      ],
      wcpm: 100,
      correctCount: 4,
      totalWords: 5,
    });
  });

  it("uses the existing homophone rules and ignores probability", () => {
    expect(
      oralReadingAlign("We can see the sea.", [
        { word: "we", start: 0, end: 0.4, probability: 0.01 },
        { word: "can", start: 0.4, end: 0.8 },
        { word: "sea", start: 0.8, end: 1.2 },
        { word: "the", start: 1.2, end: 1.6 },
        { word: "see", start: 1.6, end: 2 },
      ]).result,
    ).toBe("matched");
  });

  it("returns an all-unclear result for empty or no-speech input", () => {
    expect(oralReadingAlign("We can run.", [])).toEqual({
      result: "unclear",
      perWord: [{ state: "unclear" }, { state: "unclear" }, { state: "unclear" }],
      wcpm: undefined,
      correctCount: 0,
      totalWords: 3,
    });
    expect(
      oralReadingAlign("We can run.", [{ word: "...", start: 0, end: 1 }]),
    ).toMatchObject({ result: "unclear", correctCount: 0, wcpm: undefined });
  });

  it("guards zero spans and clamps implausibly fast readings", () => {
    expect(
      oralReadingAlign("We run.", [
        { word: "we", start: 2, end: 2 },
        { word: "run", start: 2, end: 2 },
      ]).wcpm,
    ).toBeUndefined();

    expect(
      oralReadingAlign("We run.", [
        { word: "we", start: 0, end: 0.1 },
        { word: "run", start: 0.1, end: 0.2 },
      ]).wcpm,
    ).toBe(300);
  });
});
