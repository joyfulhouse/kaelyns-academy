import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookHarness = vi.hoisted(() => {
  let refCursor = 0;
  let stateCursor = 0;
  const refs: { current: unknown }[] = [];
  const states: unknown[] = [];

  return {
    effects: [] as (() => void | (() => void))[],
    snapshot: "live" as "live" | "server",
    beginRender() {
      refCursor = 0;
      stateCursor = 0;
      this.effects = [];
    },
    reset() {
      refs.length = 0;
      states.length = 0;
      this.snapshot = "live";
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

const media = vi.hoisted(() => ({
  cancelNarration: vi.fn(),
  narrate: vi.fn(),
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    hookHarness.effects.push(effect);
  },
  useMemo: (factory: () => unknown) => factory(),
  useRef: hookHarness.useRef,
  useState: hookHarness.useState,
  useSyncExternalStore: (
    _subscribe: unknown,
    getSnapshot: () => unknown,
    getServerSnapshot: () => unknown,
  ) => (hookHarness.snapshot === "server" ? getServerSnapshot() : getSnapshot()),
}));

vi.mock("@/components/learner/narrate", () => ({
  narrate: media.narrate,
}));

vi.mock("@/lib/capture", () => ({ captureNonCritical: vi.fn() }));

import { useSpeech } from "./useSpeech";

interface FakeUtteranceShape {
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  pitch: number;
  rate: number;
  voice: SpeechSynthesisVoice | null;
}

class FakeUtterance implements FakeUtteranceShape {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pitch = 1;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(readonly text: string) {}
}

const mandarinVoice = {
  default: true,
  lang: "zh-TW",
  localService: true,
  name: "Test Mandarin",
  voiceURI: "test-mandarin",
} as SpeechSynthesisVoice;

function useRenderedSpeech(locale = "en-US") {
  hookHarness.beginRender();
  return useSpeech(locale);
}

function setupEffect(): () => void {
  const cleanup = hookHarness.effects[0]?.();
  if (typeof cleanup !== "function") throw new Error("Expected useSpeech cleanup");
  return cleanup;
}

async function flushCleanup(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useSpeech capability and lifecycle", () => {
  beforeEach(() => {
    hookHarness.reset();
    vi.resetAllMocks();
    media.narrate.mockImplementation(
      (_text: string, options: { onComplete?: () => void }) => {
        queueMicrotask(() => options.onComplete?.());
        return { cancel: media.cancelNarration };
      },
    );
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: class {},
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { SpeechSynthesisUtterance: FakeUtterance },
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "Audio");
    Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance");
    Reflect.deleteProperty(globalThis, "window");
  });

  it("advertises and completes English neural narration without Web Speech", async () => {
    const speech = useRenderedSpeech();
    const cleanup = setupEffect();

    expect(speech.supported).toBe(true);
    await expect(speech.speak("Read this sentence")).resolves.toBe("completed");
    expect(media.narrate).toHaveBeenCalledOnce();

    cleanup();
    await flushCleanup();
  });

  it("exposes a real neural-plus-browser failure to child-facing callers", async () => {
    media.narrate.mockImplementation(
      (_text: string, options: { onUnavailable: () => void }) => {
        options.onUnavailable();
        return { cancel: media.cancelNarration };
      },
    );
    const speech = useRenderedSpeech();
    const cleanup = setupEffect();

    expect(speech.lastOutcome).toBeNull();
    await expect(speech.speak("Hear the target")).resolves.toBe("unavailable");
    expect(useRenderedSpeech().lastOutcome).toBe("unavailable");

    cleanup();
    await flushCleanup();
  });

  it("checks the live non-English voice on the first hydrated request", async () => {
    hookHarness.snapshot = "server";
    const utterances: FakeUtterance[] = [];
    const synth = {
      addEventListener: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [mandarinVoice],
      removeEventListener: vi.fn(),
      speak: (utterance: FakeUtterance) => utterances.push(utterance),
    };
    Object.assign(globalThis.window as object, { speechSynthesis: synth });
    const speech = useRenderedSpeech("zh-TW");

    const result = speech.speak("ㄅ");
    expect(utterances).toHaveLength(1);
    utterances[0]?.onend?.();
    await expect(result).resolves.toBe("completed");
  });

  it("preserves one-shot narration across a same-locale StrictMode remount", async () => {
    let completeNarration: (() => void) | undefined;
    media.narrate.mockImplementation(
      (_text: string, options: { onComplete?: () => void }) => {
        completeNarration = options.onComplete;
        return { cancel: media.cancelNarration };
      },
    );
    const speech = useRenderedSpeech();
    const firstCleanup = setupEffect();
    const result = speech.speak("Listen once");

    firstCleanup();
    const secondCleanup = setupEffect();
    await flushCleanup();
    expect(media.cancelNarration).not.toHaveBeenCalled();
    completeNarration?.();
    await expect(result).resolves.toBe("completed");

    secondCleanup();
    await flushCleanup();
  });

  it("cancels narration after a real unmount", async () => {
    media.narrate.mockReturnValue({ cancel: media.cancelNarration });
    const speech = useRenderedSpeech();
    const cleanup = setupEffect();
    const result = speech.speak("Still playing");

    cleanup();
    await flushCleanup();

    expect(media.cancelNarration).toHaveBeenCalledOnce();
    await expect(result).resolves.toBe("cancelled");
  });

  it("cancels the previous locale before installing the next locale", async () => {
    media.narrate.mockReturnValue({ cancel: media.cancelNarration });
    const english = useRenderedSpeech("en-US");
    const englishCleanup = setupEffect();
    const result = english.speak("Hello");

    useRenderedSpeech("zh-TW");
    englishCleanup();
    const mandarinCleanup = setupEffect();
    await flushCleanup();

    expect(media.cancelNarration).toHaveBeenCalledOnce();
    await expect(result).resolves.toBe("cancelled");

    mandarinCleanup();
    await flushCleanup();
  });
});
