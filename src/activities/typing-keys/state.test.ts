import { describe, expect, it } from "vitest";
import type { TypingCharIntent } from "../_shared/typing/typingKey";
import { initialKeysState, isKeysComplete, pressKey, pressNextKey } from "./state";

function key(char: string, shiftKey = false): TypingCharIntent {
  return { type: "char", char, shiftKey, code: "" };
}

describe("Key Camp state", () => {
  it("advances on the right key and banks a clean prompt", () => {
    const next = pressKey(initialKeysState(), "f", key("f"));
    expect(next.index).toBe(1);
    expect(next.retries).toBe(0);
    expect(next.done).toEqual([{ key: "f", ok: true, retries: 0 }]);
  });

  it("counts a wrong key as a retry and stays put — no penalty, no advance", () => {
    const next = pressKey(initialKeysState(), "f", key("d"));
    expect(next.index).toBe(0);
    expect(next.retries).toBe(1);
    expect(next.done).toEqual([]);
  });

  it("carries the retry count onto the prompt it belongs to", () => {
    let state = initialKeysState();
    state = pressKey(state, "f", key("d"));
    state = pressKey(state, "f", key("g"));
    state = pressKey(state, "f", key("f"));
    expect(state.done).toEqual([{ key: "f", ok: true, retries: 2 }]);
    expect(state.retries).toBe(0);
  });

  it("is case-forgiving: a stray CapsLock must not fail a lowercase drill", () => {
    expect(pressKey(initialKeysState(), "f", key("F")).index).toBe(1);
  });

  it("still demands the shift when the drill IS the capital", () => {
    expect(pressKey(initialKeysState(), "F", key("f", true)).index).toBe(1);
    expect(pressKey(initialKeysState(), "F", key("F")).index).toBe(0);
    expect(pressKey(initialKeysState(), "F", key("F", true)).index).toBe(1);
  });

  it("caps retries so a mashed keyboard cannot overflow the response schema", () => {
    let state = initialKeysState();
    for (let i = 0; i < 30; i += 1) state = pressKey(state, "f", key("d"));
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
    state = pressNextKey(state, prompts, key("f"));
    state = pressNextKey(state, prompts, key("j"));

    expect(state.index).toBe(2);
    expect(state.done).toEqual([
      { key: "f", ok: true, retries: 0 },
      { key: "j", ok: true, retries: 0 },
    ]);
  });

  it("ignores another key after the completion transition", () => {
    const prompts = ["f"];
    const complete = pressNextKey(initialKeysState(), prompts, key("f"));
    expect(pressNextKey(complete, prompts, key("f"))).toBe(complete);
  });
});
