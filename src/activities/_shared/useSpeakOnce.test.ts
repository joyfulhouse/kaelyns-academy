import { describe, expect, it } from "vitest";
import { shouldRunOneShotEffect } from "./useSpeakOnce";

describe("one-shot activity audio", () => {
  it("honors a disabled read-aloud default for ordinary auto-speech", () => {
    expect(shouldRunOneShotEffect(false, false)).toBe(false);
  });

  it("allows an explicit exception for essential content audio", () => {
    expect(shouldRunOneShotEffect(false, true)).toBe(true);
  });
});
