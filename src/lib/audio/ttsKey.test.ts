// src/lib/audio/ttsKey.test.ts
import { describe, expect, it } from "vitest";
import { normalizeText, ttsKey } from "./ttsKey";

describe("ttsKey", () => {
  it("normalizes surrounding + internal whitespace only", () => {
    expect(normalizeText("  Find   the\nword ")).toBe("Find the word");
    expect(normalizeText("Keep Case!")).toBe("Keep Case!"); // case + punctuation preserved
  });

  it("is deterministic and 64-char hex", () => {
    const k = ttsKey("Find the word", "af_heart", 0.9);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(ttsKey("Find the word", "af_heart", 0.9)).toBe(k);
  });

  it("dedupes trivial whitespace differences", () => {
    expect(ttsKey("Find  the word", "af_heart", 0.9)).toBe(
      ttsKey(" Find the word ", "af_heart", 0.9),
    );
  });

  it("changes with voice and speed", () => {
    const base = ttsKey("hi", "af_heart", 0.9);
    expect(ttsKey("hi", "af_bella", 0.9)).not.toBe(base);
    expect(ttsKey("hi", "af_heart", 1.0)).not.toBe(base);
  });
});
