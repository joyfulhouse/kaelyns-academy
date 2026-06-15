// src/lib/audio/spokenFields.test.ts
import { describe, expect, it } from "vitest";
import { spokenEnglishStrings } from "./spokenFields";

describe("spokenEnglishStrings", () => {
  it("pulls instruction + passage + question prompts from a reading item", () => {
    const item = {
      instruction: "Read the story.",
      title: "The Cat",
      passage: "A cat sat.",
      questions: [{ prompt: "Who sat?", choices: ["cat", "dog"], answerIndex: 0, kind: "literal" }],
      retellPrompt: "Tell me what happened.",
    };
    expect(spokenEnglishStrings(item)).toEqual([
      "Read the story.",
      "A cat sat.",
      "Who sat?",
      "Tell me what happened.",
    ]);
  });

  it("pulls instruction + words from a sightword item and dedupes/blank-skips", () => {
    const item = { instruction: "Find 'the'.", words: ["the", "the"], decoys: ["teh"] };
    expect(spokenEnglishStrings(item)).toEqual(["Find 'the'.", "the"]);
  });

  it("returns [] for an item with no spoken fields", () => {
    expect(spokenEnglishStrings({ rows: 3, cols: 4, mode: "build" })).toEqual([]);
  });
});
