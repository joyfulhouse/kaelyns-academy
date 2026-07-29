import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { underGroundUnit } from "@/content/programs/keyboard-club/under-ground";
import type { TypingCharIntent } from "../_shared/typing/typingKey";
import { roundIsPaused } from "../_shared/typing/roundPause";
import { expectedSpawnCount, fallMs, score } from "./logic";
import {
  initialCatchState,
  resolveAirborne,
  roundOver,
  tick,
  typeChar,
} from "./state";

const CONFIG: TypingCatchConfig = {
  instruction: "Pop the stars!",
  pool: ["a", "s"],
  durationSec: 40,
  lives: 2,
  speed: "gentle", // 8s fall, 4s spawn interval
};

function key(char: string, shiftKey = false): TypingCharIntent {
  return { type: "char", char, shiftKey, code: "" };
}

function perfectAtFullFall(config: TypingCatchConfig) {
  let state = initialCatchState(config, 0);
  const durationMs = (config.durationSec ?? 45) * 1_000;
  for (let nowMs = 100; nowMs <= durationMs; nowMs += 100) {
    state = tick(state, config, nowMs);
    for (const target of state.targets) {
      if (nowMs - target.spawnedMs < fallMs(config)) continue;
      state = typeChar(state, config, key(target.text), nowMs);
    }
  }
  const finished = resolveAirborne(state, durationMs);
  return score(config, {
    prompts: finished.results,
    endedBy: "time",
    elapsedMs: durationMs,
  });
}

describe("Star Catch state", () => {
  it("spawns its first star immediately so the sky is never empty", () => {
    expect(initialCatchState(CONFIG, 0).targets).toHaveLength(1);
  });

  it("spawns on the interval, not on every tick", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 1_000);
    expect(state.targets).toHaveLength(1);
    state = tick(state, CONFIG, 4_000);
    expect(state.targets).toHaveLength(2);
  });

  it("cycles the pool deterministically rather than at random", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = tick(state, CONFIG, 8_000);
    expect(state.targets.map((t) => t.text)).toEqual(["a", "s", "a"]);
  });

  it("spawns through the full-fall cutoff and never after it", () => {
    const longLived = { ...CONFIG, lives: 99 };
    let state = initialCatchState(longLived, 0);
    for (let nowMs = 4_000; nowMs <= 40_000; nowMs += 4_000) {
      state = tick(state, longLived, nowMs);
    }

    expect(state.poolCursor).toBe(expectedSpawnCount(longLived));
    expect(state.poolCursor).toBe(9);
    expect(state.targets.at(-1)?.spawnedMs).toBe(32_000);
  });

  it("lands a star that was never typed, costing a heart", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 8_001);
    expect(state.lives).toBe(1);
    expect(state.results).toEqual([{ text: "a", ok: false, ms: 8_000 }]);
    expect(state.targets.some((t) => t.text === "a" && t.spawnedMs === 0)).toBe(false);
  });

  it("pops the matching star and banks the catch", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, key("a"), 1_500);
    expect(state.targets).toHaveLength(0);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 1_500 }]);
    expect(state.lives).toBe(2);
  });

  it("costs nothing for a wrong key — a miss in the air is not a miss on the ground", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, key("z"), 1_500);
    expect(state.lives).toBe(2);
    expect(state.results).toEqual([]);
    expect(state.targets).toHaveLength(1);
  });

  it("pops only the oldest match when two of the same letter are falling", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = tick(state, CONFIG, 8_000); // a, s, a
    state = typeChar(state, CONFIG, key("a"), 8_500);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 8_500 }]);
    expect(state.targets.map((t) => t.text)).toEqual(["s", "a"]);
  });

  it("is case-forgiving on a lowercase target", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, key("A"), 1_000);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 1_000 }]);
  });

  it("requires Shift when the falling target is a capital", () => {
    const capitalConfig = { ...CONFIG, pool: ["A", "s"] };
    const missed = typeChar(
      initialCatchState(capitalConfig, 0),
      capitalConfig,
      key("A"),
      1_000,
    );
    const caught = typeChar(
      initialCatchState(capitalConfig, 0),
      capitalConfig,
      key("A", true),
      1_000,
    );

    expect(missed.results).toEqual([]);
    expect(missed.targets).toHaveLength(1);
    expect(caught.results).toEqual([{ text: "A", ok: true, ms: 1_000 }]);
  });

  it("catches a capital target when Shift+CapsLock reports a lowercase character", () => {
    const capitalConfig = { ...CONFIG, pool: ["A", "s"] };
    const caught = typeChar(
      initialCatchState(capitalConfig, 0),
      capitalConfig,
      key("a", true),
      1_000,
    );

    expect(caught.results).toEqual([{ text: "A", ok: true, ms: 1_000 }]);
    expect(caught.targets).toHaveLength(0);
  });

  it("banks every airborne target as a miss when time expires", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = typeChar(state, CONFIG, key("a"), 5_000);
    const finished = resolveAirborne(state, 40_000);

    expect(finished.targets).toEqual([]);
    expect(finished.results).toEqual([
      { text: "a", ok: true, ms: 5_000 },
      { text: "s", ok: false, ms: 36_000 },
    ]);
  });

  it("banks every airborne target as a miss when hearts run out", () => {
    const state = {
      targets: [{ id: 6, text: "a", spawnedMs: 24_000 }],
      nextId: 7,
      lives: 0,
      results: [
        { text: "a", ok: true, ms: 1_000 },
        { text: "s", ok: true, ms: 1_000 },
        { text: "a", ok: true, ms: 1_000 },
        { text: "s", ok: false, ms: 8_000 },
        { text: "a", ok: false, ms: 8_000 },
        { text: "s", ok: false, ms: 8_000 },
      ],
      lastSpawnMs: 24_000,
      poolCursor: 7,
    };
    const finished = resolveAirborne(state, 28_000);
    const result = score(CONFIG, {
      prompts: finished.results,
      endedBy: "lives",
      elapsedMs: 28_000,
    });

    expect(finished.targets).toEqual([]);
    expect(finished.results.at(-1)).toEqual({ text: "a", ok: false, ms: 4_000 });
    expect(result).toMatchObject({ correct: 3, total: 7, stars: 1 });
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "not_yet" },
    ]);
  });

  it("gives a perfect real under-catch-all round three stars", () => {
    const activity = underGroundUnit.lessons
      .flatMap((lesson) => lesson.activities)
      .find((candidate) => candidate.id === "under-catch-all")!;
    if (activity.kind !== "typing-catch") throw new Error("under-catch-all changed kind");

    expect(perfectAtFullFall(activity.config)).toMatchObject({
      correct: 14,
      total: 14,
      stars: 3,
    });
  });

  it("gives a perfect 45-second gentle round three stars", () => {
    expect(perfectAtFullFall({ ...CONFIG, durationSec: 45, lives: 3 })).toMatchObject({
      correct: 10,
      total: 10,
      stars: 3,
    });
  });

  it("ends on the clock", () => {
    const state = initialCatchState(CONFIG, 0);
    expect(roundOver(state, CONFIG, 39_000)).toBeNull();
    expect(roundOver(state, CONFIG, 40_000)).toBe("time");
  });

  it("ends when the last heart goes out", () => {
    const state = { ...initialCatchState(CONFIG, 0), lives: 0 };
    expect(roundOver(state, CONFIG, 1_000)).toBe("lives");
  });
});
