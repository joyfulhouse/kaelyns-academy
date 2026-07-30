import { describe, expect, it } from "vitest";
import type { TypingEchoConfig } from "@/content/activity-configs";
import { responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingEchoConfig = {
  instruction: "Watch the letters, then type them from memory.",
  sequences: ["fj", "dk", "sl"],
  flashMs: 1_200,
};

const perfect = {
  sequences: [
    { i: 0, ok: true, ms: 900, retries: 0, missedExpected: [] as string[] },
    { i: 1, ok: true, ms: 800, retries: 0, missedExpected: [] as string[] },
    { i: 2, ok: true, ms: 700, retries: 0, missedExpected: [] as string[] },
  ],
};

describe("typing-echo scoring", () => {
  it("scores a perfect round 3 stars with words.familiar evidence", () => {
    const result = score(CONFIG, perfect);
    expect(result).toMatchObject({ correct: 3, total: 3, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill)).toEqual(["typing.words.familiar"]);
  });

  it("counts only first-try sequences as correct", () => {
    const mixed = {
      sequences: [
        perfect.sequences[0],
        { i: 1, ok: false, ms: 2_000, retries: 1, missedExpected: ["d"] },
        perfect.sequences[2],
      ],
    };
    expect(score(CONFIG, mixed)).toMatchObject({ correct: 2, total: 3 });
  });

  it("ignores flashMs entirely (timing is never evidence)", () => {
    const slow = score({ ...CONFIG, flashMs: 2_000 }, perfect);
    const fast = score({ ...CONFIG, flashMs: 400 }, perfect);
    expect(slow).toEqual(fast);
  });

  it("fails closed on count mismatch, shuffled indices, and alien characters", () => {
    expect(score(CONFIG, { sequences: perfect.sequences.slice(1) })).toEqual({
      correct: 0, total: 3, stars: 1, skillEvidence: [],
    });
    const shuffled = { sequences: [perfect.sequences[1], perfect.sequences[0], perfect.sequences[2]] };
    expect(score(CONFIG, shuffled).skillEvidence).toEqual([]);
    const alien = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["z"] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    expect(score(CONFIG, alien).skillEvidence).toEqual([]);
  });

  it("fails closed on both reducer-impossible ok:false shapes", () => {
    const noMiss = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: [] as string[] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    const noRetry = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 0, missedExpected: ["f"] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    expect(score(CONFIG, noMiss).skillEvidence).toEqual([]);
    expect(score(CONFIG, noRetry).skillEvidence).toEqual([]);
  });

  it("rejects a lowercase stand-in for a capital target (§8 exact-case)", () => {
    const capitals: TypingEchoConfig = { ...CONFIG, sequences: ["Fj", "dk", "sl"] };
    const forged = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["f"] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    expect(score(capitals, forged).skillEvidence).toEqual([]);
  });

  it("responseSchema pins the shared clamp bounds", () => {
    const over = {
      sequences: [{ i: 0, ok: false, ms: 600_001, retries: 1, missedExpected: ["f"] }],
    };
    expect(responseSchema.safeParse(over).success).toBe(false);
  });
});

describe("typing-echo derivation", () => {
  it("skills are exactly words.familiar", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.words.familiar"]);
  });

  it("validateGenerated rejects untaught characters and duplicate sequences", () => {
    expect(validateGenerated({ ...CONFIG, sequences: ["f1", "dk", "sl"] })).toMatch(/untaught/);
    expect(validateGenerated({ ...CONFIG, sequences: ["fj", "fj", "sl"] })).toMatch(/duplicate/);
    expect(validateGenerated(CONFIG)).toBeNull();
  });
});
