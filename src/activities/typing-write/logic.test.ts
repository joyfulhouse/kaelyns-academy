import { describe, expect, it } from "vitest";
import type { TypingWriteConfig } from "@/content/activity-configs";
import { responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingWriteConfig = {
  instruction: "Type each word.",
  mode: "see",
  scope: "word",
  items: ["cat", "map", "sat"],
};

const perfect = {
  items: [
    { i: 0, ok: true, ms: 900, retries: 0, missedExpected: [] },
    { i: 1, ok: true, ms: 800, retries: 0, missedExpected: [] },
    { i: 2, ok: true, ms: 700, retries: 0, missedExpected: [] },
  ],
};

describe("typing-write scoring", () => {
  it("scores a perfect round 3 stars with words.reach evidence", () => {
    const result = score(CONFIG, perfect);
    expect(result).toMatchObject({ correct: 3, total: 3, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill)).toEqual(["typing.words.reach"]);
  });

  it("a corrected item is complete but not first-try", () => {
    const response = {
      items: [
        perfect.items[0],
        { i: 1, ok: false, ms: 2_000, retries: 1, missedExpected: ["m"] },
        perfect.items[2],
      ],
    };
    const result = score(CONFIG, response);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(3);
  });

  it("fails closed when the item count does not match the config", () => {
    const short = { items: perfect.items.slice(0, 2) };
    expect(score(CONFIG, short)).toEqual({ correct: 0, total: 3, stars: 1, skillEvidence: [] });
  });

  it("fails closed on out-of-order or duplicated indices", () => {
    const dup = { items: [perfect.items[0], perfect.items[0], perfect.items[2]] };
    expect(score(CONFIG, dup).skillEvidence).toEqual([]);
  });

  it("fails closed when missedExpected is not drawn from the item's own characters (§8)", () => {
    const alien = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["z"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };
    expect(score(CONFIG, alien).skillEvidence).toEqual([]);
  });

  it("fails closed when missedExpected changes the case of the exact expected character (§8)", () => {
    const capitalConfig: TypingWriteConfig = {
      ...CONFIG,
      scope: "sentence",
      items: ["Bat.", "Map.", "Sat."],
    };
    const forged = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["b"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };

    expect(score(capitalConfig, forged).skillEvidence).toEqual([]);
  });

  it("accepts an honest corrected capital with exact expected-character provenance", () => {
    const capitalConfig: TypingWriteConfig = {
      ...CONFIG,
      scope: "sentence",
      items: ["Bat.", "Map.", "Sat."],
    };
    const honest = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["B"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };

    expect(score(capitalConfig, honest)).toMatchObject({ correct: 2, total: 3 });
    expect(score(capitalConfig, honest).skillEvidence).not.toEqual([]);
  });

  it("fails closed when ok contradicts retries/missedExpected", () => {
    const liar = {
      items: [
        { i: 0, ok: true, ms: 900, retries: 3, missedExpected: [] },
        perfect.items[1],
        perfect.items[2],
      ],
    };
    expect(score(CONFIG, liar).skillEvidence).toEqual([]);
  });

  it("fails closed when a non-first-try item carries no missed character", () => {
    // Reducer-impossible: a diverged word always records its first episode's
    // expected character, so retries >= 1 with an empty missedExpected is
    // forgery (a clean full-length buffer completes before past-end keys).
    const forged = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: [] },
        perfect.items[1],
        perfect.items[2],
      ],
    };
    expect(score(CONFIG, forged)).toEqual({ correct: 0, total: 3, stars: 1, skillEvidence: [] });
  });

  it("fails closed when a completed non-first-try item has no counted retry", () => {
    const impossible = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 0, missedExpected: ["c"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };

    expect(score(CONFIG, impossible).skillEvidence).toEqual([]);
  });

  it("fails closed on duplicate missedExpected entries", () => {
    const impossible = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 2, missedExpected: ["c", "c"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };

    expect(score(CONFIG, impossible).skillEvidence).toEqual([]);
  });

  it("fails closed when missedExpected has more entries than counted retries", () => {
    const impossible = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["c", "a"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };

    expect(score(CONFIG, impossible).skillEvidence).toEqual([]);
  });

  it("responseSchema rejects multi-char missedExpected entries", () => {
    const bad = {
      items: [{ i: 0, ok: false, ms: 1, retries: 1, missedExpected: ["ca"] }],
    };
    expect(responseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("typing-write derivation", () => {
  it("skills are exactly words.reach for whole-keyboard words", () => {
    // "cat"/"map"/"sat" all leave the home row.
    expect(skillsAffected(CONFIG)).toEqual(["typing.words.reach"]);
  });

  it("skills are exactly words.familiar for home-row-only words", () => {
    expect(skillsAffected({ ...CONFIG, items: ["sad", "dad", "flask"] })).toEqual([
      "typing.words.familiar",
    ]);
  });

  // One reach makes the whole set a reaching set — otherwise the easy words in
  // a mixed set would credit the home-row skill and re-open the subset hole.
  it("treats a mixed set as reaching", () => {
    expect(skillsAffected({ ...CONFIG, items: ["sad", "cat"] })).toEqual([
      "typing.words.reach",
    ]);
  });

  it("validateGenerated rejects untaught characters", () => {
    expect(validateGenerated({ ...CONFIG, items: ["can't", "map", "sat"] })).toMatch(/untaught/);
    expect(validateGenerated({ ...CONFIG, items: ["cat", "map", "sat"] })).toBeNull();
  });

  it("validateGenerated accepts sentence scope with capitals, spaces, periods", () => {
    expect(
      validateGenerated({
        instruction: "Type the sentence.",
        mode: "see",
        scope: "sentence",
        items: ["The fat cat sat.", "A pig can dig.", "Ben can get the pen."],
      }),
    ).toBeNull();
  });
});
