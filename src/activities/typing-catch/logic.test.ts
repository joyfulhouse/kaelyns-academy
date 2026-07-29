import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import {
  expectedSpawnCount,
  score,
  skillsAffected,
  spawnIntervalMs,
  validateGenerated,
} from "./logic";

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

  it("derives the exact number of stars a round can show", () => {
    expect(expectedSpawnCount(CONFIG)).toBe(9);
    expect(expectedSpawnCount({ ...CONFIG, durationSec: 30, speed: "steady" })).toBe(11);
    expect(expectedSpawnCount({ ...CONFIG, speed: "zippy" })).toBe(25);
  });
});

describe("score", () => {
  it("scores a genuine full-length round against everything that fell", () => {
    const result = score(
      CONFIG,
      round([
        { text: "a", ok: true },
        { text: "s", ok: true },
        { text: "d", ok: true },
        { text: "f", ok: true },
        { text: "a", ok: true },
        { text: "s", ok: true },
        { text: "d", ok: true },
        { text: "f", ok: true },
        { text: "a", ok: true },
      ]),
    );
    expect(result.correct).toBe(9);
    expect(result.total).toBe(9);
    expect(result.stars).toBe(3);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "solid" },
    ]);
  });

  it("accepts genuine targets in resolution order rather than spawn order", () => {
    const result = score(
      CONFIG,
      round([
        { text: "f", ok: true },
        { text: "a", ok: true },
        { text: "s", ok: true },
        { text: "d", ok: true },
        { text: "a", ok: true },
        { text: "s", ok: true },
        { text: "d", ok: true },
        { text: "f", ok: true },
        { text: "a", ok: true },
      ]),
    );

    expect(result.correct).toBe(9);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "solid" },
    ]);
  });

  it("scores a genuine hearts-lost round when every heart has a miss", () => {
    const result = score(
      CONFIG,
      round(
        [
          { text: "a", ok: true },
          { text: "s", ok: true },
          { text: "d", ok: false },
          { text: "f", ok: false },
          { text: "a", ok: false },
        ],
        "lives",
      ),
    );
    expect(result.correct).toBe(2);
    expect(result.stars).toBe(1);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "not_yet" },
    ]);
  });

  it("never awards zero stars for finishing", () => {
    const result = score(
      CONFIG,
      round(
        [
          { text: "a", ok: false },
          { text: "s", ok: false },
          { text: "d", ok: false },
        ],
        "lives",
      ),
    );
    expect(result.stars).toBe(1);
  });

  it("fails closed when a forged lives round has not lost every heart", () => {
    const forged = {
      prompts: [{ text: CONFIG.pool[0]!, ok: true, ms: 0 }],
      endedBy: "lives" as const,
      elapsedMs: 1,
    };

    expect(score(CONFIG, forged)).toEqual({
      correct: 0,
      total: 1,
      stars: 1,
      skillEvidence: [],
    });
  });

  it("fails closed when a forged timed round has too few resolved prompts", () => {
    const forged = {
      prompts: [{ text: CONFIG.pool[0]!, ok: true, ms: 0 }],
      endedBy: "time" as const,
      elapsedMs: 1,
    };

    expect(score(CONFIG, forged)).toEqual({
      correct: 0,
      total: 1,
      stars: 1,
      skillEvidence: [],
    });
  });

  it("fails closed when authored targets do not match the deterministic spawn bag", () => {
    const forged = round(
      Array.from({ length: expectedSpawnCount(CONFIG) }, () => ({
        text: CONFIG.pool[0]!,
        ok: true,
      })),
    );

    expect(score(CONFIG, forged)).toEqual({
      correct: 0,
      total: expectedSpawnCount(CONFIG),
      stars: 1,
      skillEvidence: [],
    });
  });

  it("applies the deterministic spawn bag check to hearts-lost rounds", () => {
    const forged = round(
      [
        { text: "a", ok: true },
        { text: "a", ok: true },
        { text: "a", ok: false },
        { text: "a", ok: false },
        { text: "a", ok: false },
      ],
      "lives",
    );

    expect(score(CONFIG, forged).skillEvidence).toEqual([]);
  });

  it("yields no evidence for a target that was never in the pool", () => {
    const forged = Array.from({ length: expectedSpawnCount(CONFIG) }, (_, index) => ({
      text: index === 0 ? "z" : "a",
      ok: true,
    }));
    const result = score(CONFIG, round(forged));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence for more catches than the round could have shown", () => {
    const forged = round(
      Array.from({ length: expectedSpawnCount(CONFIG) + 1 }, (_, index) => ({
        text: CONFIG.pool[index % CONFIG.pool.length]!,
        ok: true,
      })),
    );
    expect(score(CONFIG, forged).skillEvidence).toEqual([]);
  });

  it("ignores the client's clock entirely — WPM must never reach mastery", () => {
    const fullRound = Array.from({ length: expectedSpawnCount(CONFIG) }, (_, index) => ({
      text: CONFIG.pool[index % CONFIG.pool.length]!,
      ok: true,
    }));
    const honest = score(CONFIG, round(fullRound));
    const lying = score(CONFIG, {
      ...round(fullRound),
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
