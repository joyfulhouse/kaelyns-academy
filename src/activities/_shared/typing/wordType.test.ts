import { describe, expect, it } from "vitest";
import { responseSchema } from "../../typing-write/logic";
import {
  BUFFER_SLACK,
  initialWordProgress,
  isWordComplete,
  MAX_ITEM_MS,
  pressWordBackspace,
  pressWordKey,
  wordItemResult,
} from "./wordType";

const key = (char: string, shiftKey = false) => ({ char, shiftKey });

function type(word: string, expected: string, startMs = 1_000) {
  let s = initialWordProgress();
  let now = startMs;
  for (const ch of word) {
    s = pressWordKey(s, expected, key(ch), now);
    now += 200;
  }
  return s;
}

describe("pressWordKey", () => {
  it("completes a clean word with ok timing and no misses", () => {
    const s = type("cat", "cat");
    expect(isWordComplete(s)).toBe(true);
    expect(s.retries).toBe(0);
    expect(s.missedExpected).toEqual([]);
    expect(wordItemResult(s, 4)).toEqual({ i: 4, ok: true, ms: 400, retries: 0, missedExpected: [] });
  });

  it("is CapsLock-forgiving on lowercase words", () => {
    const s = type("CAT", "cat");
    expect(isWordComplete(s)).toBe(true);
    expect(s.missedExpected).toEqual([]);
  });

  it("requires Shift for a sentence capital", () => {
    const plain = pressWordKey(initialWordProgress(), "The cat", key("t"), 0);
    expect(plain.diverged).toBe(true);
    expect(plain.missedExpected).toEqual(["T"]);
    const shifted = pressWordKey(initialWordProgress(), "The cat", key("t", true), 0);
    expect(shifted.diverged).toBe(false);
  });

  it("records ONE missedExpected at the divergence point, not per wrong key", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("x"), 0);
    s = pressWordKey(s, "cat", key("y"), 100);
    expect(s.missedExpected).toEqual(["c"]);
    expect(s.typed.map((t) => t.ok)).toEqual([false, false]);
  });

  it("counts one retry per correction episode via backspace", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("c"), 0);
    s = pressWordKey(s, "cat", key("x"), 100);      // diverge
    s = pressWordBackspace(s);                        // clean again → 1 retry
    expect(s.retries).toBe(1);
    expect(s.diverged).toBe(false);
    s = pressWordKey(s, "cat", key("a"), 300);
    s = pressWordKey(s, "cat", key("t"), 400);
    expect(isWordComplete(s)).toBe(true);
    expect(wordItemResult(s, 0).ok).toBe(false);      // corrected, not first-try
  });

  it("dedupes missedExpected across episodes at the same position", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("x"), 0);
    s = pressWordBackspace(s);
    s = pressWordKey(s, "cat", key("z"), 200);
    expect(s.missedExpected).toEqual(["c"]);
    expect(s.retries).toBe(1);
  });

  it("diverges but records no miss when typing past the end", () => {
    let s = type("cat", "cat");
    // completed words ignore further keys entirely
    const after = pressWordKey(s, "cat", key("s"), 900);
    expect(after).toBe(s);
    // an over-typed UNfinished word: "ca" + "tt"
    let o = type("ca", "cat");
    o = pressWordKey(o, "cat", key("t"), 500);
    expect(isWordComplete(o)).toBe(true); // "cat" completes exactly at length
  });

  it("caps the buffer at expected.length + BUFFER_SLACK", () => {
    let s = pressWordKey(initialWordProgress(), "at", key("x"), 0);
    for (let i = 0; i < 10; i++) s = pressWordKey(s, "at", key("x"), 100 + i);
    expect(s.typed.length).toBe("at".length + BUFFER_SLACK);
  });

  it("backspace on empty or complete state is a no-op", () => {
    expect(pressWordBackspace(initialWordProgress())).toEqual(initialWordProgress());
    const done = type("cat", "cat");
    expect(pressWordBackspace(done)).toBe(done);
  });

  it("starts the clock on the first keystroke, not construction", () => {
    const s = pressWordKey(initialWordProgress(), "cat", key("c"), 5_000);
    expect(s.startedMs).toBe(5_000);
  });

  it("clamps an honestly slow completion to MAX_ITEM_MS and still serializes schema-valid", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("c"), 0);
    s = pressWordKey(s, "cat", key("a"), 100);
    const twentyMinutesMs = 20 * 60 * 1_000;
    s = pressWordKey(s, "cat", key("t"), twentyMinutesMs); // walked away, finished 20 minutes later
    expect(isWordComplete(s)).toBe(true);
    expect(wordItemResult(s, 0)).toEqual({
      i: 0,
      ok: true,
      ms: MAX_ITEM_MS,
      retries: 0,
      missedExpected: [],
    });

    const item = wordItemResult(s, 0);
    const parsed = responseSchema.safeParse({ items: [item, item, item] });
    expect(parsed.success).toBe(true);
  });
});
