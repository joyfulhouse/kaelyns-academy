import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import {
  maxPrompts,
  minPrompts,
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

  it("bounds how many stars a round could possibly have shown", () => {
    expect(minPrompts(CONFIG)).toBe(8);
    expect(maxPrompts(CONFIG)).toBe(11);
    expect(minPrompts({ ...CONFIG, durationSec: 30, speed: "steady" })).toBe(10);
    expect(maxPrompts({ ...CONFIG, durationSec: 30, speed: "steady" })).toBe(13);
    expect(minPrompts({ ...CONFIG, speed: "zippy" })).toBe(25);
    expect(maxPrompts({ ...CONFIG, speed: "zippy" })).toBe(27);
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
        { text: "s", ok: true },
        // The target spawned on the time-up tick has no playable frame, so the
        // Player resolves it as a miss along with any other airborne stars.
        { text: "d", ok: false },
      ]),
    );
    expect(result.correct).toBe(10);
    expect(result.total).toBe(11);
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "emerging" },
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

  it("yields no evidence for a target that was never in the pool", () => {
    const forged = Array.from({ length: minPrompts(CONFIG) }, (_, index) => ({
      text: index === 0 ? "z" : "a",
      ok: true,
    }));
    const result = score(CONFIG, round(forged));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence for more catches than the round could have shown", () => {
    const forged = round(Array.from({ length: 13 }, () => ({ text: "a", ok: true })));
    expect(score(CONFIG, forged).skillEvidence).toEqual([]);
  });

  it("ignores the client's clock entirely — WPM must never reach mastery", () => {
    const fullRound = Array.from({ length: minPrompts(CONFIG) }, () => ({
      text: "a",
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
