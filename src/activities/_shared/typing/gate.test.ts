import { describe, expect, it } from "vitest";
import { gateState, isProofKey } from "./gate";

describe("isProofKey", () => {
  it("accepts only the advertised home-row anchor, case-insensitively", () => {
    expect(isProofKey({ char: "f", code: "KeyF" })).toBe(true);
    expect(isProofKey({ char: "F", code: "KeyF" })).toBe(true);
    expect(isProofKey({ char: "a", code: "KeyA" })).toBe(false);
    expect(isProofKey({ char: " ", code: "Space" })).toBe(false);
  });

  it("accepts the physical F position on a non-Latin keyboard layout", () => {
    expect(isProofKey({ char: "а", code: "KeyF" })).toBe(true);
  });
});

describe("gateState", () => {
  it("opens once a real keypress has proven a keyboard", () => {
    expect(gateState({ coarsePointerOnly: false, keyboardProven: true })).toBe("open");
  });

  it("opens for a tablet too, if a keyboard is attached and used", () => {
    expect(gateState({ coarsePointerOnly: true, keyboardProven: true })).toBe("open");
  });

  it("explains itself on a touch-only device", () => {
    expect(gateState({ coarsePointerOnly: true, keyboardProven: false })).toBe("blocked");
  });

  it("asks for proof on a device that looks like it has a keyboard", () => {
    expect(gateState({ coarsePointerOnly: false, keyboardProven: false })).toBe("prove");
  });
});
