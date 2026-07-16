// src/lib/audio/spokenFields.test.ts
import { describe, expect, it } from "vitest";
import { prewarmTexts, spokenEnglishStrings } from "./spokenFields";

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

  it("warms each sight-word round's actual spoken cue", () => {
    const item = {
      instruction: "Listen, then find it.",
      rounds: [
        { target: "the", spokenPrompt: "Find the word the.", choices: ["the", "they"] },
        { target: "you", choices: ["you", "your"] },
      ],
    };
    expect(spokenEnglishStrings(item)).toEqual([
      "Listen, then find it.",
      "Find the word the.",
      "you",
    ]);
  });

  it("returns [] for an item with no spoken fields", () => {
    expect(spokenEnglishStrings({ rows: 3, cols: 4, mode: "build" })).toEqual([]);
  });

  it("emits each phonics-wordbuild word and tile, applying phoneme overrides", () => {
    const item = {
      focus: "the six syllable types",
      instruction: "Build it.",
      tiles: ["ta", "ble", "rab"],
      say: { ta: "tˈA", ble: "bəl" }, // "rab" already phonemizes fine → spoken bare
      words: [{ word: "table" }, { word: "rabbit", ipa: "ɹˈæbət" }],
    };
    expect(spokenEnglishStrings(item)).toEqual([
      "Build it.",
      "table",
      "[rabbit](/ɹˈæbət/)",
      "[ta](/tˈA/)",
      "[ble](/bəl/)",
      "rab",
    ]);
  });

  it("skips silent tiles (e.g. magic-e) — they make no sound to warm", () => {
    const item = {
      focus: "silent-e",
      instruction: "Add the magic e.",
      tiles: ["c", "a", "k", "e"],
      say: { c: "k", a: "A", k: "k" },
      silent: ["e"],
      words: [{ word: "cake" }],
    };
    expect(spokenEnglishStrings(item)).toEqual([
      "Add the magic e.",
      "cake",
      "[c](/k/)",
      "[a](/A/)",
      "[k](/k/)",
    ]);
  });
});

describe("prewarmTexts", () => {
  it("dedupes identical strings across items", () => {
    const item = { instruction: "Go", tiles: ["a", "b"], words: [{ word: "ab" }] };
    const many = Array.from({ length: 50 }, () => item);
    expect(prewarmTexts(many)).toEqual(["Go", "ab", "a", "b"]);
  });

  it("dedupes whitespace variants that hash to the same narration key", () => {
    // ttsKey normalizes whitespace, so " cat ", "cat\n", "cat" are ONE clip; the
    // raw-string Set would miss this and warm the same key several times.
    const items = [{ instruction: "cat" }, { instruction: " cat " }, { instruction: "cat\n" }];
    expect(prewarmTexts(items)).toEqual(["cat"]);
  });

  it("hard-caps the total for a large distinct batch (bounds prewarm fan-out)", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      instruction: `instr ${i}`,
      tiles: Array.from({ length: 16 }, (_, j) => `t${i}-${j}`),
      words: Array.from({ length: 12 }, (_, j) => ({ word: `w${i}-${j}` })),
    }));
    const out = prewarmTexts(items, 64);
    expect(out.length).toBe(64);
    expect(new Set(out).size).toBe(64); // all unique, nothing past the cap
  });
});
