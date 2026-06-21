import { describe, expect, it } from "vitest";
import { tilePhonemeText, withPhonemes } from "./phonemes";

describe("withPhonemes", () => {
  it("wraps a label + IPA as Kokoro/misaki inline override markup", () => {
    expect(withPhonemes("ta", "tˈA")).toBe("[ta](/tˈA/)");
  });

  it("tolerates author-supplied surrounding slashes and whitespace", () => {
    expect(withPhonemes("ble", " /bəl/ ")).toBe("[ble](/bəl/)");
  });

  it("strips stray markup delimiters anywhere so the markup can't break", () => {
    expect(withPhonemes("x", "a/b")).toBe("[x](/ab/)");
    expect(withPhonemes("x", "a)b](c")).toBe("[x](/abc/)");
  });

  it("returns the bare label when the IPA is empty (no broken markup)", () => {
    expect(withPhonemes("p", "  ")).toBe("p");
  });
});

describe("tilePhonemeText", () => {
  it("wraps a tile that has an authored override", () => {
    expect(tilePhonemeText("ble", { ble: "bəl" })).toBe("[ble](/bəl/)");
  });

  it("returns undefined when the tile has no override (caller speaks it bare)", () => {
    expect(tilePhonemeText("rab", { ble: "bəl" })).toBeUndefined();
    expect(tilePhonemeText("rab", undefined)).toBeUndefined();
  });

  it("ignores a blank override value", () => {
    expect(tilePhonemeText("rab", { rab: "   " })).toBeUndefined();
  });
});
