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
  it("scores a perfect round 3 stars with words.familiar evidence", () => {
    const result = score(CONFIG, perfect);
    expect(result).toMatchObject({ correct: 3, total: 3, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill)).toEqual(["typing.words.familiar"]);
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

  it("responseSchema rejects multi-char missedExpected entries", () => {
    const bad = {
      items: [{ i: 0, ok: false, ms: 1, retries: 1, missedExpected: ["ca"] }],
    };
    expect(responseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("typing-write derivation", () => {
  it("skills are exactly words.familiar", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.words.familiar"]);
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
