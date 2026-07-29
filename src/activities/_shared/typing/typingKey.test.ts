import { describe, expect, it } from "vitest";
import {
  classifyKeydown,
  matchesTypingTarget,
  preventsDefault,
  type KeydownLike,
} from "./typingKey";

function press(overrides: Partial<KeydownLike> & { key: string }): KeydownLike {
  return {
    code: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...overrides,
  };
}

describe("classifyKeydown", () => {
  it("reads a plain letter as that character", () => {
    expect(classifyKeydown(press({ key: "f", code: "KeyF" }))).toEqual({
      type: "char",
      char: "f",
      shiftKey: false,
      code: "KeyF",
    });
  });

  it("keeps the capital a capital", () => {
    expect(classifyKeydown(press({ key: "F", code: "KeyF", shiftKey: true }))).toEqual({
      type: "char",
      char: "F",
      shiftKey: true,
      code: "KeyF",
    });
  });

  it("reads the space bar as a space character", () => {
    expect(classifyKeydown(press({ key: " ", code: "Space" }))).toEqual({
      type: "char",
      char: " ",
      shiftKey: false,
      code: "Space",
    });
  });

  it("ignores shortcuts so browser and OS keys never count as typing", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(classifyKeydown(press({ key: "f", [modifier]: true }))).toEqual({ type: "ignore" });
    }
  });

  it("ignores auto-repeat — a held key is one intent, not a stream", () => {
    expect(classifyKeydown(press({ key: "f", repeat: true }))).toEqual({ type: "ignore" });
  });

  it("ignores IME composition and dead keys", () => {
    expect(classifyKeydown(press({ key: "f", isComposing: true }))).toEqual({ type: "ignore" });
    expect(classifyKeydown(press({ key: "Dead" }))).toEqual({ type: "ignore" });
    expect(classifyKeydown(press({ key: "Process" }))).toEqual({ type: "ignore" });
  });

  it("never treats a bare modifier or navigation key as a miss", () => {
    for (const key of ["Shift", "Tab", "Enter", "ArrowLeft", "CapsLock", "Escape"]) {
      expect(classifyKeydown(press({ key })), key).toEqual({ type: "ignore" });
    }
  });

  it("reads backspace as its own intent", () => {
    expect(classifyKeydown(press({ key: "Backspace" }))).toEqual({ type: "backspace" });
  });
});

describe("preventsDefault", () => {
  it("swallows the keys that would scroll the page or open browser find", () => {
    for (const key of [" ", "'", "/", "Backspace"]) {
      expect(preventsDefault(press({ key })), key).toBe(true);
    }
  });

  it("leaves ordinary letters and real shortcuts alone", () => {
    expect(preventsDefault(press({ key: "f" }))).toBe(false);
    expect(preventsDefault(press({ key: "r", ctrlKey: true }))).toBe(false);
  });
});

describe("matchesTypingTarget", () => {
  it("forgives CapsLock for lowercase targets", () => {
    expect(matchesTypingTarget("a", { char: "A", shiftKey: false })).toBe(true);
  });

  it("accepts a normal Shift+a chord for a capital target", () => {
    expect(matchesTypingTarget("A", { char: "A", shiftKey: true })).toBe(true);
  });

  it("accepts a CapsLock-on Shift+a chord for a capital target", () => {
    expect(matchesTypingTarget("A", { char: "a", shiftKey: true })).toBe(true);
  });

  it("rejects CapsLock alone for a capital target", () => {
    expect(matchesTypingTarget("A", { char: "A", shiftKey: false })).toBe(false);
  });

  it("rejects a bare lowercase press for a capital target", () => {
    expect(matchesTypingTarget("A", { char: "a", shiftKey: false })).toBe(false);
  });
});
