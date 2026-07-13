import { describe, expect, it } from "vitest";
import { matchOralReading, normalizeOralReading } from "./oralReadingMatch";

describe("normalizeOralReading", () => {
  it("lowercases and strips punctuation and whitespace", () => {
    expect(normalizeOralReading("  The, RED fox!  ")).toBe("the red fox");
  });

  it("folds number words and digits to the same form", () => {
    expect(normalizeOralReading("I see two cats")).toBe("i see 2 cats");
    expect(normalizeOralReading("I see 2 cats")).toBe("i see 2 cats");
  });
});

describe("matchOralReading", () => {
  it("returns no-speech for empty or punctuation-only transcripts", () => {
    expect(matchOralReading("read", "   ")).toBe("no-speech");
    expect(matchOralReading("read", "...?!")).toBe("no-speech");
  });

  it("accepts exact and contained readings after normalization", () => {
    expect(matchOralReading("The red fox", "the red fox")).toBe("matched");
    expect(matchOralReading("red", "I read red")).toBe("matched");
    expect(matchOralReading("I can see", "please I can see now")).toBe("matched");
  });

  it("does not accept an incomplete target phrase", () => {
    expect(matchOralReading("we can", "we")).toBe("unclear");
    expect(matchOralReading("I can see", "can see")).toBe("unclear");
  });

  it.each([
    ["to", "two"],
    ["there", "their"],
    ["they're", "there"],
    ["no", "know"],
    ["for", "four"],
    ["one", "won"],
    ["see", "sea"],
    ["be", "bee"],
    ["hi", "high"],
    ["ate", "eight"],
    ["red", "read"],
    ["two", "2"],
  ])("accepts the homophone/number pair %s and %s", (target, transcript) => {
    expect(matchOralReading(target, transcript)).toBe("matched");
  });

  it("accepts edit distance within max(1, floor(length / 4)) for longer targets", () => {
    expect(matchOralReading("planet", "planit")).toBe("matched");
    expect(matchOralReading("sunshine", "sunshyne")).toBe("matched");
  });

  it("returns unclear when edit distance exceeds the length-scaled bound", () => {
    expect(matchOralReading("planet", "plated")).toBe("unclear");
    expect(matchOralReading("sunshine", "moonbeam")).toBe("unclear");
  });

  it("never edit-distance-matches short sight-words to unrelated neighbours", () => {
    // One tolerated edit on a 2-4 letter word is a different word, not a
    // near-miss pronunciation — these must stay unclear (honey), never matched.
    expect(matchOralReading("to", "go")).toBe("unclear");
    expect(matchOralReading("the", "she")).toBe("unclear");
    expect(matchOralReading("and", "end")).toBe("unclear");
    expect(matchOralReading("and", "sand")).toBe("unclear");
    expect(matchOralReading("cat", "cap")).toBe("unclear");
    expect(matchOralReading("have", "gave")).toBe("unclear");
  });

  it("matches multi-word targets only token-by-token", () => {
    // A one-edit slip on the compact phrase must not certify a different word.
    expect(matchOralReading("we can", "we ran")).toBe("unclear");
    expect(matchOralReading("we can", "we cant")).toBe("unclear");
    expect(matchOralReading("we can", "we can")).toBe("matched");
    expect(matchOralReading("we can see", "we can sea")).toBe("matched");
  });

  it("caps containment at two extra spoken words", () => {
    expect(matchOralReading("the", "um the")).toBe("matched");
    expect(matchOralReading("the", "I did not say the")).toBe("unclear");
  });
});
