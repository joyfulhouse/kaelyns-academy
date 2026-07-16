import { describe, expect, it } from "vitest";
import {
  applyManualJournalText,
  contributedTextLength,
  createJournalTextState,
  firstBlankRange,
  insertJournalText,
  qualifiesForJournalCompletion,
  recognizedPhrase,
  usedDictation,
} from "./state";

describe("journal contribution state", () => {
  it("does not let an inserted authored frame qualify as learner text", () => {
    const frame = "The volcano erupted because ______.";
    const inserted = insertJournalText(
      createJournalTextState(),
      frame,
      0,
      0,
      "scaffold",
    );

    expect(
      qualifiesForJournalCompletion({
        markCount: 0,
        textLength: contributedTextLength(inserted.state),
        usedDictation: false,
      }),
    ).toBe(false);
  });

  it("does not count an authored sentence starter as child contribution", () => {
    expect(
      contributedTextLength(createJournalTextState("My favorite animal is", "scaffold")),
    ).toBe(0);
    expect(contributedTextLength(createJournalTextState("a cat"))).toBe(5);
  });

  it("counts manual edits and removes their contribution when they are deleted", () => {
    const frame = createJournalTextState("The volcano erupted because ______.", "scaffold");
    const edited = applyManualJournalText(
      frame,
      "The volcano erupted because ______. It was loud.",
    );

    expect(contributedTextLength(edited)).toBe(" It was loud.".trim().length);
    expect(contributedTextLength(applyManualJournalText(edited, frame.text))).toBe(0);
  });

  it("counts a word-bank blank replacement but not the surrounding frame", () => {
    const frame = createJournalTextState("The ______ erupted.", "scaffold");
    const filled = insertJournalText(frame, "volcano", 0, 0, "word-bank", true);

    expect(filled.state.text).toBe("The volcano erupted.");
    expect(contributedTextLength(filled.state)).toBe("volcano".length);
    expect(usedDictation(filled.state)).toBe(false);
  });

  it("returns to zero contribution when a learner fill is deleted from a frame", () => {
    const frame = createJournalTextState("The ______ erupted.", "scaffold");
    const filled = insertJournalText(frame, "volcano", 0, 0, "word-bank", true).state;
    const reverted = applyManualJournalText(filled, "The  erupted.");

    expect(contributedTextLength(reverted)).toBe(0);
  });

  it("tracks successful dictation only while dictated text remains", () => {
    const frame = createJournalTextState("I noticed ", "scaffold");
    const dictated = insertJournalText(
      frame,
      "a blue whale",
      frame.text.length,
      frame.text.length,
      "dictation",
    ).state;

    expect(contributedTextLength(dictated)).toBe("a blue whale".length);
    expect(usedDictation(dictated)).toBe(true);

    const reverted = applyManualJournalText(dictated, frame.text);
    expect(contributedTextLength(reverted)).toBe(0);
    expect(usedDictation(reverted)).toBe(false);
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
    expect(insertJournalText(createJournalTextState("The sails."), "boat", 4, 4, "manual")).toEqual({
      state: expect.objectContaining({ text: "The boat sails." }),
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it("replaces the selected range", () => {
    expect(insertJournalText(createJournalTextState("The slow boat."), "fast", 4, 8, "manual")).toEqual({
      state: expect.objectContaining({ text: "The fast boat." }),
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it("puts a word-bank choice into the first explicit blank", () => {
    expect(insertJournalText(createJournalTextState("The ______ erupted."), "volcano", 0, 0, "word-bank", true)).toEqual({
      state: expect.objectContaining({ text: "The volcano erupted." }),
      selectionStart: 11,
      selectionEnd: 11,
    });
  });

  it("finds the first authored blank so a selected frame can focus it", () => {
    expect(firstBlankRange("First, ______. Then, ______.")).toEqual({ start: 7, end: 13 });
    expect(firstBlankRange("No blank here.")).toBeNull();
  });

  it("caps inserted text without returning an out-of-range caret", () => {
    const result = insertJournalText(
      createJournalTextState("x".repeat(1_999)),
      "hello",
      1_999,
      1_999,
      "manual",
    );
    expect(result.state.text).toHaveLength(2_000);
    expect(result.selectionStart).toBe(2_000);
    expect(result.selectionEnd).toBe(2_000);
  });

  it("does not change a full field when a recognized phrase has no room", () => {
    const full = "x".repeat(2_000);
    expect(
      insertJournalText(
        createJournalTextState(full),
        "new words",
        2_000,
        2_000,
        "dictation",
      ).state.text,
    ).toBe(full);
  });
});
