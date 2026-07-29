import { describe, expect, it } from "vitest";
import { initialKeysState, isKeysComplete, pressKey, pressNextKey } from "./state";

describe("Key Camp state", () => {
  it("advances on the right key and banks a clean prompt", () => {
    const next = pressKey(initialKeysState(), "f", "f");
    expect(next.index).toBe(1);
    expect(next.retries).toBe(0);
    expect(next.done).toEqual([{ key: "f", ok: true, retries: 0 }]);
  });

  it("counts a wrong key as a retry and stays put — no penalty, no advance", () => {
    const next = pressKey(initialKeysState(), "f", "d");
    expect(next.index).toBe(0);
    expect(next.retries).toBe(1);
    expect(next.done).toEqual([]);
  });

  it("carries the retry count onto the prompt it belongs to", () => {
    let state = initialKeysState();
    state = pressKey(state, "f", "d");
    state = pressKey(state, "f", "g");
    state = pressKey(state, "f", "f");
    expect(state.done).toEqual([{ key: "f", ok: true, retries: 2 }]);
    expect(state.retries).toBe(0);
  });

  it("is case-forgiving: a stray CapsLock must not fail a lowercase drill", () => {
    expect(pressKey(initialKeysState(), "f", "F").index).toBe(1);
  });

  it("still demands the shift when the drill IS the capital", () => {
    expect(pressKey(initialKeysState(), "F", "f").index).toBe(0);
    expect(pressKey(initialKeysState(), "F", "F").index).toBe(1);
  });

  it("caps retries so a mashed keyboard cannot overflow the response schema", () => {
    let state = initialKeysState();
    for (let i = 0; i < 30; i += 1) state = pressKey(state, "f", "d");
    expect(state.retries).toBe(20);
  });

  it("knows when the drill is finished", () => {
    const state = { index: 4, retries: 0, done: [] };
    expect(isKeysComplete(state, 4)).toBe(true);
    expect(isKeysComplete(state, 5)).toBe(false);
  });

  it("derives each expected key from current state so rapid presses cannot lose an advance", () => {
    const prompts = ["f", "j"];
    let state = initialKeysState();
    state = pressNextKey(state, prompts, "f");
    state = pressNextKey(state, prompts, "j");

    expect(state.index).toBe(2);
    expect(state.done).toEqual([
      { key: "f", ok: true, retries: 0 },
      { key: "j", ok: true, retries: 0 },
    ]);
  });

  it("ignores another key after the completion transition", () => {
    const prompts = ["f"];
    const complete = pressNextKey(initialKeysState(), prompts, "f");
    expect(pressNextKey(complete, prompts, "f")).toBe(complete);
  });
});
