import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import {
  finishTimedRound,
  initialCatchState,
  roundIsPaused,
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

  it("lands a star that was never typed, costing a heart", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 8_001);
    expect(state.lives).toBe(1);
    expect(state.results).toEqual([{ text: "a", ok: false, ms: 8_000 }]);
    expect(state.targets.some((t) => t.text === "a" && t.spawnedMs === 0)).toBe(false);
  });

  it("pops the matching star and banks the catch", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, "a", 1_500);
    expect(state.targets).toHaveLength(0);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 1_500 }]);
    expect(state.lives).toBe(2);
  });

  it("costs nothing for a wrong key — a miss in the air is not a miss on the ground", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, "z", 1_500);
    expect(state.lives).toBe(2);
    expect(state.results).toEqual([]);
    expect(state.targets).toHaveLength(1);
  });

  it("pops only the oldest match when two of the same letter are falling", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = tick(state, CONFIG, 8_000); // a, s, a
    state = typeChar(state, CONFIG, "a", 8_500);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 8_500 }]);
    expect(state.targets.map((t) => t.text)).toEqual(["s", "a"]);
  });

  it("is case-forgiving on a lowercase target", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, "A", 1_000);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 1_000 }]);
  });

  it("requires exact case when the falling target is a capital", () => {
    const capitalConfig = { ...CONFIG, pool: ["A", "s"] };
    const missed = typeChar(initialCatchState(capitalConfig, 0), capitalConfig, "a", 1_000);
    const caught = typeChar(initialCatchState(capitalConfig, 0), capitalConfig, "A", 1_000);

    expect(missed.results).toEqual([]);
    expect(missed.targets).toHaveLength(1);
    expect(caught.results).toEqual([{ text: "A", ok: true, ms: 1_000 }]);
  });

  it("banks every airborne target as a miss when time expires", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = typeChar(state, CONFIG, "a", 5_000);
    const finished = finishTimedRound(state, 40_000);

    expect(finished.targets).toEqual([]);
    expect(finished.results).toEqual([
      { text: "a", ok: true, ms: 5_000 },
      { text: "s", ok: false, ms: 36_000 },
    ]);
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

describe("Star Catch pause state", () => {
  it("pauses for a hidden document or blurred window and resumes only when both recover", () => {
    expect(roundIsPaused(false, true)).toBe(false);
    expect(roundIsPaused(true, true)).toBe(true);
    expect(roundIsPaused(false, false)).toBe(true);
    expect(roundIsPaused(true, false)).toBe(true);
  });
});
