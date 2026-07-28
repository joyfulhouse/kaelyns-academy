import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { maxPrompts, score, skillsAffected, spawnIntervalMs, validateGenerated } from "./logic";

const CONFIG: TypingCatchConfig = {
  instruction: "Pop the stars!",
  pool: ["a", "s", "d", "f"],
  durationSec: 40,
  lives: 3,
  speed: "gentle",
};

function round(spec: { text: string; ok: boolean }[], endedBy: "time" | "lives" = "time") {
  return {
    prompts: spec.map((s) => ({ ...s, ms: 1_000 })),
    endedBy,
    elapsedMs: 40_000,
  };
}

describe("pacing", () => {
  it("spawns twice per fall, so at most two stars share the sky", () => {
    expect(spawnIntervalMs(CONFIG)).toBe(4_000);
    expect(spawnIntervalMs({ ...CONFIG, speed: "zippy" })).toBe(1_500);
  });

  it("bounds how many stars a round could possibly have shown", () => {
    expect(maxPrompts(CONFIG)).toBe(12);
  });
});

describe("score", () => {
  it("scores catches against everything that fell", () => {
    const result = score(
      CONFIG,
      round([
        { text: "a", ok: true },
        { text: "s", ok: true },
        { text: "d", ok: true },
        { text: "f", ok: true },
      ]),
    );
    expect(result.correct).toBe(4);
    expect(result.total).toBe(4);
    expect(result.stars).toBe(3);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "solid" },
    ]);
  });

  it("still records evidence when the round ended on hearts", () => {
    const result = score(
      CONFIG,
      round(
        [
          { text: "a", ok: true },
          { text: "s", ok: true },
          { text: "d", ok: false },
          { text: "f", ok: false },
        ],
        "lives",
      ),
    );
    expect(result.correct).toBe(2);
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "emerging" },
    ]);
  });

  it("never awards zero stars for finishing", () => {
    const result = score(CONFIG, round([{ text: "a", ok: false }], "lives"));
    expect(result.stars).toBe(1);
  });

  it("yields no evidence for a target that was never in the pool", () => {
    const result = score(CONFIG, round([{ text: "z", ok: true }]));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence for more catches than the round could have shown", () => {
    const forged = round(Array.from({ length: 13 }, () => ({ text: "a", ok: true })));
    expect(score(CONFIG, forged).skillEvidence).toEqual([]);
  });

  it("ignores the client's clock entirely — WPM must never reach mastery", () => {
    const honest = score(CONFIG, round([{ text: "a", ok: true }]));
    const lying = score(CONFIG, {
      ...round([{ text: "a", ok: true }]),
      elapsedMs: 1,
    });
    expect(lying).toEqual(honest);
  });
});

describe("skillsAffected", () => {
  it("derives from the pool", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.keys.home-row"]);
    expect(skillsAffected({ ...CONFIG, pool: ["a", "q"] })).toEqual([
      "typing.keys.home-row",
      "typing.keys.top-row",
    ]);
  });
});

describe("validateGenerated", () => {
  it("accepts a teachable pool", () => {
    expect(validateGenerated(CONFIG)).toBeNull();
  });

  it("rejects an untaught target", () => {
    expect(validateGenerated({ ...CONFIG, pool: ["a", "7"] })).toBe("untaught key: 7");
  });

  it("rejects a duplicated target", () => {
    expect(validateGenerated({ ...CONFIG, pool: ["a", "a"] })).toBe("duplicate target: a");
  });
});
