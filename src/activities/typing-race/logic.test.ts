import { describe, expect, it } from "vitest";
import type { TypingRaceConfig } from "@/content/activity-configs";
import { responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingRaceConfig = {
  instruction: "Type each word to hop the rocket forward!",
  words: ["ask", "sad", "dad", "fall", "flask", "salad"],
  pacerWpm: 8,
};

const perfectWords = CONFIG.words.map((word, i) => ({
  i,
  ok: true,
  ms: 900,
  retries: 0,
  missedExpected: [] as string[],
}));

describe("typing-race scoring", () => {
  it("scores a perfect run with BOTH word and fluency evidence", () => {
    const result = score(CONFIG, { words: perfectWords, elapsedMs: 30_000 });
    expect(result).toMatchObject({ correct: 6, total: 6, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill).sort()).toEqual([
      "typing.fluency.rate",
      "typing.words.familiar",
    ]);
  });

  it("finishing behind the pacer is still a full finish (score ignores elapsed)", () => {
    const slow = score(CONFIG, { words: perfectWords, elapsedMs: 1_700_000 });
    expect(responseSchema.safeParse({ words: perfectWords, elapsedMs: 1_700_000 }).success).toBe(
      false,
    );
    // in-bounds slow elapsed:
    expect(score(CONFIG, { words: perfectWords, elapsedMs: 1_500_000 }).stars).toBe(3);
    void slow;
  });

  it("fails closed on word-count mismatch and alien missedExpected", () => {
    expect(score(CONFIG, { words: perfectWords.slice(1), elapsedMs: 30_000 }).skillEvidence).toEqual(
      [],
    );
    const alien = perfectWords.map((w, i) =>
      i === 0 ? { ...w, ok: false, retries: 1, missedExpected: ["q"] } : w,
    );
    expect(score(CONFIG, { words: alien, elapsedMs: 30_000 }).skillEvidence).toEqual([]);
  });

  it("fails closed on a non-first-try word with no missed character (forgery shape)", () => {
    const forged = perfectWords.map((w, i) =>
      i === 0 ? { ...w, ok: false, retries: 1, missedExpected: [] as string[] } : w,
    );
    expect(score(CONFIG, { words: forged, elapsedMs: 30_000 }).skillEvidence).toEqual([]);
  });
});

describe("typing-race derivation", () => {
  it("skills = fluency.rate + words.familiar, sorted", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.fluency.rate", "typing.words.familiar"]);
  });
  it("validateGenerated rejects untaught characters and duplicates", () => {
    expect(validateGenerated({ ...CONFIG, words: [...CONFIG.words.slice(1), "café"] })).toMatch(
      /untaught/,
    );
    // Note: slice(1) here (mirroring the untaught-char case above) would only
    // reorder the same 6 unique words, never duplicate one — slice(0, -1)
    // drops the last word so re-appending "ask" actually collides.
    expect(validateGenerated({ ...CONFIG, words: [...CONFIG.words.slice(0, -1), "ask"] })).toMatch(
      /duplicate/,
    );
    expect(validateGenerated(CONFIG)).toBeNull();
  });
});
