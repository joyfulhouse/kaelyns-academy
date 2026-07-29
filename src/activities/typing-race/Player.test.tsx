import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingRaceConfig } from "@/content/activity-configs";
import type { KeyIntent } from "../_shared/typing/typingKey";
import type { TypingRaceResponse } from "./logic";

/**
 * Same technique as typing-write/Player.test.tsx (this suite runs in vitest's
 * "node" environment, with no jsdom/window): mock React's own useState/useRef/
 * useEffect so `RaceRound` can be invoked directly, repeatedly, like a manual
 * re-render, while `useTypingKeys` is mocked just enough to capture the exact
 * handler the Player wires up. The live-readout interval effect guards itself
 * on `typeof window === "undefined"` (an SSR-safety check that also happens to
 * make it a no-op here) — so per-word timing lands at a deterministic 0ms
 * throughout, which is exactly why the pacer/WPM math is tested separately as
 * pure functions rather than through a real ticking clock.
 */
const fixtures = vi.hoisted(() => ({
  refIndex: 0,
  refValues: [] as { current: unknown }[],
  stateIndex: 0,
  stateValues: [] as unknown[],
  speech: {
    supported: true,
    hasVoice: true,
    speak: vi.fn(() => Promise.resolve("completed" as const)),
    cancel: vi.fn(),
  },
  speakOnce: vi.fn(),
  onIntent: null as ((intent: KeyIntent) => void) | null,
  paused: false,
  documentHidden: false,
  reducedMotion: false,
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => {
    effect();
  },
  useRef: (initial: unknown) => {
    const index = fixtures.refIndex++;
    if (index >= fixtures.refValues.length) fixtures.refValues[index] = { current: initial };
    return fixtures.refValues[index];
  },
  useState: (initial: unknown) => {
    const index = fixtures.stateIndex++;
    if (index >= fixtures.stateValues.length) {
      fixtures.stateValues[index] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    const setter = (next: unknown) => {
      fixtures.stateValues[index] =
        typeof next === "function"
          ? (next as (prior: unknown) => unknown)(fixtures.stateValues[index])
          : next;
    };
    return [fixtures.stateValues[index], setter];
  },
}));

vi.mock("../_shared/useActivity", () => ({
  useActivity: (schema: { parse: (config: unknown) => unknown }, config: unknown) =>
    schema.parse(config),
}));
vi.mock("../_shared/useSpeech", () => ({
  useSpeech: () => fixtures.speech,
}));
vi.mock("../_shared/useSpeakOnce", () => ({
  useSpeakOnce: (...args: unknown[]) => fixtures.speakOnce(...args),
}));
vi.mock("../_shared/typing/useTypingKeys", () => ({
  useTypingKeys: (onIntent: (intent: KeyIntent) => void) => {
    fixtures.onIntent = onIntent;
  },
}));
vi.mock("../_shared/typing/TypingStage", () => ({
  TypingStage: ({ children }: { children: unknown }) => children,
}));
vi.mock("../_shared/typing/roundPause", () => ({
  useRoundPaused: () => fixtures.paused,
  useDocumentHidden: () => fixtures.documentHidden,
}));
vi.mock("../_shared/useReducedMotion", () => ({
  useReducedMotion: () => fixtures.reducedMotion,
}));

import { TypingStage } from "../_shared/typing/TypingStage";
import {
  currentElapsedMs,
  pacerChars,
  raceFraction,
  RaceRound,
  totalChars,
  TypingRacePlayer,
} from "./Player";

function renderRound(
  config: TypingRaceConfig,
  onComplete: (response: TypingRaceResponse) => void,
): ReactElement {
  fixtures.refIndex = 0;
  fixtures.stateIndex = 0;
  return RaceRound({ config, onComplete }) as ReactElement;
}

function toMarkup(
  config: TypingRaceConfig,
  onComplete: (response: TypingRaceResponse) => void,
): string {
  return renderToStaticMarkup(renderRound(config, onComplete));
}

function type(char: string, shiftKey = false): void {
  fixtures.onIntent?.({ type: "char", char, code: `Key${char.toUpperCase()}`, shiftKey });
}

function backspace(): void {
  fixtures.onIntent?.({ type: "backspace" });
}

/** Reads the rocket layer's translate3d percentage out of rendered markup. */
function rocketPercent(markup: string): number {
  const match = markup.match(/data-race-rocket="true"[^>]*translate3d\(([-\d.]+)%/);
  return match ? Number(match[1]) : NaN;
}

const CONFIG: TypingRaceConfig = {
  instruction: "Type each word as fast as you can!",
  words: ["cat", "sun", "dog", "pig", "hat", "bug"],
  pacerWpm: 10,
};

beforeEach(() => {
  fixtures.refIndex = 0;
  fixtures.refValues = [];
  fixtures.stateIndex = 0;
  fixtures.stateValues = [];
  fixtures.paused = false;
  fixtures.documentHidden = false;
  fixtures.reducedMotion = false;
  fixtures.onIntent = null;
  vi.clearAllMocks();
});

describe("TypingRacePlayer shell", () => {
  it("mounts through TypingStage with the given onExit, wrapping only RaceRound (req 1)", () => {
    const onExit = () => undefined;
    const element = TypingRacePlayer({
      config: CONFIG,
      onComplete: () => undefined,
      onExit,
    }) as ReactElement<{ onExit?: () => void; children: ReactElement }>;

    expect(element.type).toBe(TypingStage);
    expect(element.props.onExit).toBe(onExit);
    expect(element.props.children.type).toBe(RaceRound);
  });
});

describe("Rocket Race pure helpers", () => {
  it("totals characters across every word", () => {
    expect(totalChars(CONFIG.words)).toBe(18);
  });

  it("derives the pace comet's fraction from pacerWpm at a mocked elapsed (req 4)", () => {
    // pacerWpm 10 -> 50 chars/min; at 12s (0.2min) that's 10 chars, well
    // short of the 18-char track (unlike 30s, which would already clamp).
    const chars = pacerChars(10, 12_000);
    expect(chars).toBeCloseTo(10);
    expect(raceFraction(chars, totalChars(CONFIG.words))).toBeCloseTo(10 / 18);
  });

  it("clamps the fraction at 1 once the comet would pass the end of the track", () => {
    expect(raceFraction(pacerChars(10, 600_000), totalChars(CONFIG.words))).toBe(1);
  });
});

describe("currentElapsedMs (D3 pause-clock accounting)", () => {
  it("returns only the accumulated total when no segment is open (paused/never started)", () => {
    expect(currentElapsedMs(1000, null, 999_999)).toBe(1000);
  });

  it("adds the open segment's wall-clock span to the accumulated total", () => {
    expect(currentElapsedMs(1000, 5000, 5800)).toBe(1800);
  });

  it("handles a zero-accumulated open segment (the very first running segment)", () => {
    expect(currentElapsedMs(0, 1000, 1500)).toBe(500);
  });
});

describe("Rocket Race word round", () => {
  it("shows the target word tiles and announces only the expected word, visible throughout (req 2, 5)", () => {
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toMatch(/aria-live="polite"[^>]*>Type cat</);
    expect(markup.match(/aria-live="polite"/g)).toHaveLength(2); // the word + the progress hint
    expect(markup.match(/bg-paper-raised/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain("word 1 of 6");
    expect(markup).toMatch(/0<\/span> words a minute/);
  });

  it("renders the track with the rocket and pace comet on a paper-sunk, ink-outlined well (req 4)", () => {
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toMatch(
      /data-race-track="true"[^>]*class="[^"]*rounded-2xl border-\[3px\] border-ink bg-paper-sunk/,
    );
    expect(markup).toContain('data-race-comet="true"');
    expect(markup).toContain('data-race-rocket="true"');
    expect(markup).toContain("translate3d(0%, 0, 0)");
    expect(markup).toContain("transition:transform 500ms linear");
    // Comet renders first, so it stacks behind the rocket.
    expect(markup.indexOf('data-race-comet="true"')).toBeLessThan(
      markup.indexOf('data-race-rocket="true"'),
    );
  });

  it("reduced motion renders a static word fraction with zero transform styles (req 6)", () => {
    fixtures.reducedMotion = true;
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).not.toContain("translate3d");
    expect(markup).not.toContain('data-race-track="true"');
    expect(markup).toContain("1 of 6 words");
  });

  it("hops the rocket forward only on completed words and never retreats on a correction (req 4)", () => {
    const onComplete = vi.fn();
    let markup = toMarkup(CONFIG, onComplete); // mount
    expect(rocketPercent(markup)).toBe(0);

    // Mid-word, even after a wrong keystroke corrected by backspace, the
    // rocket must not budge — it hops per completed word, not per character.
    type("x");
    backspace();
    type("c");
    markup = toMarkup(CONFIG, onComplete);
    expect(rocketPercent(markup)).toBe(0);

    type("a");
    type("t"); // completes "cat" -> word 1 of 6
    markup = toMarkup(CONFIG, onComplete);
    expect(rocketPercent(markup)).toBeCloseTo(100 / 6);

    type("s");
    type("u");
    type("n"); // completes "sun" -> word 2 of 6
    markup = toMarkup(CONFIG, onComplete);
    expect(rocketPercent(markup)).toBeCloseTo(200 / 6);
  });

  it("shows the pause overlay and keeps the live readout at its frozen value (req 3, 7)", () => {
    fixtures.paused = true;
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toContain("Paused — click to keep playing");
    // Paused from the start: the live-readout segment never opened, so it
    // never advanced off its initial reading.
    expect(markup).toMatch(/0<\/span> words a minute/);
  });
});

describe("Rocket Race completion (§8)", () => {
  it("reports all 6 words in order with a sane elapsedMs for a perfect run", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    for (const word of CONFIG.words) {
      for (const ch of word) type(ch);
    }
    renderRound(CONFIG, onComplete); // lets the completion effect run

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0]![0] as TypingRaceResponse;

    expect(payload.words).toHaveLength(6);
    payload.words.forEach((result, i) => {
      expect(result).toMatchObject({ i, ok: true, retries: 0, missedExpected: [] });
      expect(result).not.toHaveProperty("typed");
    });
    expect(payload.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(payload.elapsedMs)).toBe(true);
  });

  it("carries retries:1 and only the expected missed character for a wrong-then-backspace word", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    type("x");
    backspace(); // wrong first letter of "cat", corrected
    type("c");
    type("a");
    type("t"); // completes "cat"
    for (const word of CONFIG.words.slice(1)) {
      for (const ch of word) type(ch);
    }
    renderRound(CONFIG, onComplete);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0]![0] as TypingRaceResponse;

    expect(payload.words[0]).toMatchObject({ i: 0, ok: false, retries: 1, missedExpected: ["c"] });
    for (const result of payload.words) {
      expect(result.missedExpected).not.toContain("x");
    }
  });
});
