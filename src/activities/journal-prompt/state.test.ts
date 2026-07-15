import { describe, expect, it } from "vitest";
import {
  contributedTextLength,
  firstBlankRange,
  insertJournalText,
  qualifiesForJournalCompletion,
  recognizedPhrase,
} from "./state";

describe("journal contribution state", () => {
  it("does not count an authored sentence starter as child contribution", () => {
    expect(contributedTextLength("My favorite animal is", "My favorite animal is")).toBe(0);
    expect(contributedTextLength("My favorite animal is a cat", "My favorite animal is")).toBe(5);
    expect(contributedTextLength("a cat")).toBe(5);
  });

  it("requires a mark, contributed text, or successful dictation", () => {
    expect(
      qualifiesForJournalCompletion({ markCount: 0, textLength: 0, usedDictation: false }),
    ).toBe(false);
    expect(
      qualifiesForJournalCompletion({ markCount: 1, textLength: 0, usedDictation: false }),
    ).toBe(true);
    expect(
      qualifiesForJournalCompletion({ markCount: 0, textLength: 4, usedDictation: false }),
    ).toBe(true);
    expect(
      qualifiesForJournalCompletion({ markCount: 0, textLength: 4, usedDictation: true }),
    ).toBe(true);
    expect(
      qualifiesForJournalCompletion({ markCount: 0, textLength: 0, usedDictation: true }),
    ).toBe(false);
  });

  it("counts dictation only when recognition returned a nonempty phrase", () => {
    expect(recognizedPhrase("   ")).toBeNull();
    expect(recognizedPhrase("  a blue whale  ")).toBe("a blue whale");
  });
});

describe("journal caret insertion", () => {
  it("inserts at the caret without moving or replacing later text", () => {
    expect(insertJournalText("The sails.", "boat", 4, 4)).toEqual({
      text: "The boat sails.",
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it("replaces the selected range", () => {
    expect(insertJournalText("The slow boat.", "fast", 4, 8)).toEqual({
      text: "The fast boat.",
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it("puts a word-bank choice into the first explicit blank", () => {
    expect(insertJournalText("The ______ erupted.", "volcano", 0, 0, true)).toEqual({
      text: "The volcano erupted.",
      selectionStart: 11,
      selectionEnd: 11,
    });
  });

  it("finds the first authored blank so a selected frame can focus it", () => {
    expect(firstBlankRange("First, ______. Then, ______.")).toEqual({ start: 7, end: 13 });
    expect(firstBlankRange("No blank here.")).toBeNull();
  });

  it("caps inserted text without returning an out-of-range caret", () => {
    const result = insertJournalText("x".repeat(1_999), "hello", 1_999, 1_999);
    expect(result.text).toHaveLength(2_000);
    expect(result.selectionStart).toBe(2_000);
    expect(result.selectionEnd).toBe(2_000);
  });

  it("does not change a full field when a recognized phrase has no room", () => {
    const full = "x".repeat(2_000);
    expect(insertJournalText(full, "new words", 2_000, 2_000).text).toBe(full);
  });
});
