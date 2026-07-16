import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeechController, SpeechPlaybackOutcome } from "./useSpeech";

const hookHarness = vi.hoisted(() => {
  let refCursor = 0;
  let stateCursor = 0;
  const refs: { current: unknown }[] = [];
  const states: unknown[] = [];

  return {
    beginRender() {
      refCursor = 0;
      stateCursor = 0;
    },
    reset() {
      refs.length = 0;
      states.length = 0;
      this.beginRender();
    },
    useRef<T>(initial: T) {
      const index = refCursor;
      refCursor += 1;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index] as { current: T };
    },
    useState<T>(initial: T | (() => T)) {
      const index = stateCursor;
      stateCursor += 1;
      if (index >= states.length) {
        states[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setValue = (next: T | ((current: T) => T)) => {
        states[index] =
          typeof next === "function"
            ? (next as (current: T) => T)(states[index] as T)
            : next;
      };
      return [states[index] as T, setValue] as const;
    },
  };
});

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useRef: hookHarness.useRef,
  useState: hookHarness.useState,
}));

import { useTargetSpeech } from "./useTargetSpeech";

function controller(
  speak: SpeechController["speak"],
): SpeechController {
  return {
    supported: true,
    hasVoice: true,
    speak,
    cancel: () => undefined,
  };
}

function useRenderedTargetSpeech(speech: SpeechController) {
  hookHarness.beginRender();
  return useTargetSpeech(speech);
}

describe("useTargetSpeech", () => {
  beforeEach(() => hookHarness.reset());

  it("keeps a target failure visible after unrelated speech succeeds", async () => {
    const speak = vi.fn((text: string) =>
      Promise.resolve<SpeechPlaybackOutcome>(text === "target" ? "unavailable" : "completed"),
    );
    const speech = controller(speak);

    await useRenderedTargetSpeech(speech).speakTarget("target");
    expect(useRenderedTargetSpeech(speech).unavailable).toBe(true);

    await speech.speak("tile feedback");
    expect(useRenderedTargetSpeech(speech).unavailable).toBe(true);
  });

  it("clears a target failure only after that target successfully replays", async () => {
    let outcome: SpeechPlaybackOutcome = "unavailable";
    const speech = controller(() => Promise.resolve(outcome));

    await useRenderedTargetSpeech(speech).speakTarget("target");
    expect(useRenderedTargetSpeech(speech).unavailable).toBe(true);

    outcome = "completed";
    await useRenderedTargetSpeech(speech).speakTarget("target");
    expect(useRenderedTargetSpeech(speech).unavailable).toBe(false);
  });

  it("ignores an old target result after moving to a new item", async () => {
    let settle: ((outcome: SpeechPlaybackOutcome) => void) | undefined;
    const speech = controller(
      () => new Promise<SpeechPlaybackOutcome>((resolve) => {
        settle = resolve;
      }),
    );

    const pending = useRenderedTargetSpeech(speech).speakTarget("old target");
    useRenderedTargetSpeech(speech).reset();
    settle?.("unavailable");
    await pending;

    expect(useRenderedTargetSpeech(speech).unavailable).toBe(false);
  });
});
