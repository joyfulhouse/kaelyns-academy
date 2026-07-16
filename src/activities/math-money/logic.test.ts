import { describe, expect, it } from "vitest";
import type { MathMoneyConfig } from "@/content/activity-configs";
import {
  COIN_CENTS,
  coinsTotal,
  isCorrect,
  responseSchema,
  score,
  skillsAffected,
  validateGenerated,
} from "./logic";

describe("coinsTotal + COIN_CENTS", () => {
  it("sums a coin multiset", () => {
    expect(coinsTotal(["dime", "nickel", "penny"])).toBe(16);
    expect(coinsTotal([])).toBe(0);
    expect(COIN_CENTS.quarter).toBe(25);
  });
});

describe("isCorrect", () => {
  it("identify matches the target coin", () => {
    const c: MathMoneyConfig = {
      mode: "identify",
      instruction: "",
      coins: ["penny", "dime"],
      targetCoin: "dime",
    };
    expect(isCorrect(c, { attempts: 1, tappedCoin: "dime" })).toBe(true);
    expect(isCorrect(c, { attempts: 1, tappedCoin: "penny" })).toBe(false);
  });
  it("count matches the target total", () => {
    const c: MathMoneyConfig = {
      mode: "count",
      instruction: "",
      palette: ["nickel", "penny"],
      targetCents: 12,
    };
    expect(
      isCorrect(c, {
        attempts: 1,
        tokens: [
          { id: "coin-1", type: "nickel" },
          { id: "coin-2", type: "nickel" },
          { id: "coin-3", type: "penny" },
          { id: "coin-4", type: "penny" },
        ],
      }),
    ).toBe(true);
    expect(isCorrect(c, { attempts: 1, tokens: [{ id: "coin-1", type: "nickel" }] })).toBe(
      false,
    );
  });

  it("count rejects a coin the authored palette did not offer", () => {
    const c: MathMoneyConfig = {
      mode: "count",
      instruction: "",
      palette: ["nickel"],
      targetCents: 10,
    };
    expect(isCorrect(c, { attempts: 1, tokens: [{ id: "coin-1", type: "dime" }] })).toBe(false);
  });
});

describe("responseSchema", () => {
  it("accepts stable coin tokens and rejects duplicate IDs or over-bounded trays", () => {
    expect(
      responseSchema.safeParse({
        attempts: 1,
        tokens: [
          { id: "coin-1", type: "penny" },
          { id: "coin-2", type: "penny" },
        ],
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        attempts: 1,
        tokens: [
          { id: "coin-1", type: "penny" },
          { id: "coin-1", type: "nickel" },
        ],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        attempts: 1,
        tokens: Array.from({ length: 21 }, (_, index) => ({
          id: `coin-${index}`,
          type: "penny",
        })),
      }).success,
    ).toBe(false);
  });

  it("does not accept a forged client total", () => {
    expect(responseSchema.safeParse({ attempts: 1, totalCents: 25 }).success).toBe(false);
  });
});

describe("score", () => {
  const c: MathMoneyConfig = {
    mode: "count",
    instruction: "",
    palette: ["penny"],
    targetCents: 3,
  };
  it("first-try correct → 3 stars solid on math.money", () => {
    const s = score(c, {
      attempts: 1,
      tokens: [
        { id: "coin-1", type: "penny" },
        { id: "coin-2", type: "penny" },
        { id: "coin-3", type: "penny" },
      ],
    });
    expect(s).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.money", outcome: "solid" }],
    });
  });
  it("finished after retries still earns a star (never 0)", () => {
    const s = score(c, {
      attempts: 3,
      tokens: [
        { id: "coin-1", type: "penny" },
        { id: "coin-2", type: "penny" },
        { id: "coin-3", type: "penny" },
      ],
    });
    expect(s.correct).toBe(1);
    expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always math.money", () => {
    const c: MathMoneyConfig = {
      mode: "identify",
      instruction: "",
      coins: ["penny", "dime"],
      targetCoin: "dime",
    };
    expect(skillsAffected(c)).toEqual(["math.money"]);
  });
});

describe("validateGenerated (B3 answer-key net)", () => {
  it("accepts a reachable count target and rejects an unreachable one", () => {
    const base = { mode: "count" as const, instruction: "", palette: ["nickel" as const] };
    expect(validateGenerated({ ...base, targetCents: 10 })).toBeNull(); // 5+5
    expect(validateGenerated({ ...base, targetCents: 7 })).not.toBeNull(); // only multiples of 5
  });

  it("rejects an identify target that is not among the offered coins", () => {
    expect(
      validateGenerated({ mode: "identify", instruction: "", coins: ["penny"], targetCoin: "dime" }),
    ).not.toBeNull();
  });

  it("rejects duplicate palettes and targets needing too many tokens", () => {
    expect(
      validateGenerated({
        mode: "count",
        instruction: "",
        palette: ["penny", "penny"],
        targetCents: 2,
      }),
    ).not.toBeNull();
    expect(
      validateGenerated({ mode: "count", instruction: "", palette: ["penny"], targetCents: 21 }),
    ).not.toBeNull();
  });

  it("rejects duplicate identify choices", () => {
    expect(
      validateGenerated({
        mode: "identify",
        instruction: "",
        coins: ["penny", "penny"],
        targetCoin: "penny",
      }),
    ).not.toBeNull();
  });
});
