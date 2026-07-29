import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  const refs: { current: unknown }[] = [];

  return {
    readAloudEnabled: true,
    beginRender() {
      cursor = 0;
    },
    reset() {
      refs.length = 0;
      this.beginRender();
    },
    useRef<T>(initial: T) {
      const index = cursor;
      cursor += 1;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index] as { current: T };
    },
  };
});

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useContext: () => hooks.readAloudEnabled,
  useEffect: (effect: () => void) => effect(),
  useRef: hooks.useRef,
}));

import { shouldRunOneShotEffect, useSpeakOnce } from "./useSpeakOnce";

beforeEach(() => {
  hooks.reset();
  hooks.readAloudEnabled = true;
});

describe("one-shot activity audio", () => {
  it("honors a disabled read-aloud default for ordinary auto-speech", () => {
    expect(shouldRunOneShotEffect(false, false)).toBe(false);
  });

  it("allows an explicit exception for essential content audio", () => {
    expect(shouldRunOneShotEffect(false, true)).toBe(true);
  });

  it("speaks essential content once even when the read-aloud default is disabled", () => {
    hooks.readAloudEnabled = false;
    const speak = vi.fn();

    useSpeakOnce(speak, "hidden target", "target", { essentialContentAudio: true });
    hooks.beginRender();
    useSpeakOnce(speak, "ordinary instruction", "instruction");

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("hidden target");
  });

  it("waits through a null message and speaks once for each resolved key", () => {
    const speak = vi.fn();

    useSpeakOnce(speak, null, "resolving");
    hooks.beginRender();
    useSpeakOnce(speak, "Press F", "prove");
    hooks.beginRender();
    useSpeakOnce(speak, "Press F", "prove");
    hooks.beginRender();
    useSpeakOnce(speak, "Needs a keyboard", "blocked");

    expect(speak.mock.calls).toEqual([
      ["Press F"],
      ["Needs a keyboard"],
    ]);
  });
});
