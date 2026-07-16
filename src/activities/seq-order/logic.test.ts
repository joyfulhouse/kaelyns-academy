import { describe, expect, it } from "vitest";
import type { SeqOrderConfig } from "@/content/activity-configs";
import { isCorrect, responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const config: SeqOrderConfig = {
  instruction: "Put the life cycle in order.",
  cards: [
    { label: "Egg", emoji: "🥚" },
    { label: "Caterpillar", emoji: "🐛" },
    { label: "Chrysalis", emoji: "🛡️" },
    { label: "Butterfly", emoji: "🦋" },
  ],
};

describe("seq-order response", () => {
  it("accepts a bounded, strict card permutation", () => {
    expect(responseSchema.parse({ attempts: 1, order: [0, 1, 2, 3] })).toEqual({
      attempts: 1,
      order: [0, 1, 2, 3],
    });
    expect(
      responseSchema.safeParse({ attempts: 1, order: [0, 1, 2, 3], correct: true }).success,
    ).toBe(false);
  });

  it("rejects duplicate, out-of-range, incomplete, and over-bounded data", () => {
    expect(responseSchema.safeParse({ attempts: 1, order: [0, 1, 1, 3] }).success).toBe(false);
    expect(responseSchema.safeParse({ attempts: 1, order: [0, 1, 2] }).success).toBe(true);
    expect(responseSchema.safeParse({ attempts: 1, order: [0, 1, 6] }).success).toBe(false);
    expect(responseSchema.safeParse({ attempts: 21, order: [0, 1, 2] }).success).toBe(false);
  });
});

describe("seq-order correctness", () => {
  it("scores only the exact authored array order", () => {
    expect(isCorrect(config, { attempts: 1, order: [0, 1, 2, 3] })).toBe(true);
  });

  it("rejects any wrong or incomplete order without mutating it", () => {
    const wrong = [3, 1, 0, 2];
    const snapshot = [...wrong];
    expect(isCorrect(config, { attempts: 1, order: wrong })).toBe(false);
    expect(wrong).toEqual(snapshot);
    expect(isCorrect(config, { attempts: 1, order: [0, 1, 2] })).toBe(false);
  });
});

describe("seq-order score", () => {
  it("awards solid sequence evidence for a correct first check", () => {
    expect(score(config, { attempts: 1, order: [0, 1, 2, 3] })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "science.sequence", outcome: "solid" }],
    });
  });

  it("uses explicit check attempts for retry evidence", () => {
    expect(score(config, { attempts: 2, order: [0, 1, 2, 3] })).toMatchObject({
      stars: 2,
      skillEvidence: [{ skill: "science.sequence", outcome: "emerging" }],
    });
  });

  it("reports only the observed sequencing skill", () => {
    expect(skillsAffected(config)).toEqual(["science.sequence"]);
  });
});

describe("seq-order generated config validation", () => {
  it("accepts unique labels and rejects duplicate labels", () => {
    expect(validateGenerated(config)).toBeNull();
    expect(
      validateGenerated({
        instruction: "Put them in order.",
        cards: [{ label: "Egg" }, { label: " egg " }, { label: "Butterfly" }],
      }),
    ).not.toBeNull();
  });
});
