import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingEchoConfig } from "@/content/activity-configs";
import type { SpeechPlaybackOutcome } from "../_shared/useSpeech";
import type { KeyIntent } from "../_shared/typing/typingKey";
import type { TypingEchoResponse } from "./logic";
import { initialEchoState, type EchoState } from "./state";

/**
 * Same technique as typing-race/typing-write's Player tests (this suite runs
 * in vitest's "node" environment, with no jsdom/window): mock React's own
 * useState/useRef/useEffect so `EchoRound` can be invoked directly, repeatedly,
 * like a manual re-render, while `useTypingKeys` is mocked just enough to
 * capture the exact handler the Player wires up — AND its `active` flag, since
 * this suite must prove the listener detaches once the round completes. The
 * flash->recall clock itself is driven by `window.setInterval`, which is a
 * no-op in this window-less environment (guarded the same way Rocket Race's
 * live-readout is) — so phase transitions are forced directly by poking
 * `fixtures.stateValues[0]` between renders, exactly like the sibling suites
 * poke their own internal state to test paths a real tick can't reach here.
 */
const fixtures = vi.hoisted(() => ({
  refIndex: 0,
  refValues: [] as { current: unknown }[],
  stateIndex: 0,
  stateValues: [] as unknown[],
  speech: {
    supported: true,
    hasVoice: true,
    speak: vi.fn(() => Promise.resolve<SpeechPlaybackOutcome>("completed")),
    cancel: vi.fn(),
  },
  wrongShake: {
    trigger: vi.fn(),
    shakeProps: vi.fn(() => ({ animate: { x: 0 }, transition: { duration: 0.4 } })),
  },
  onIntent: null as ((intent: KeyIntent) => void) | null,
  paused: false,
  documentHidden: false,
  reducedMotion: false,
  readAloudEnabled: true,
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
vi.mock("../_shared/useSpeakOnce", async (importActual) => ({
  // `shouldRunOneShotEffect` is a hookless pure function — kept real (Player
  // no longer calls `useSpeakOnce` itself, round 3: both the instruction and
  // the sequence speak via manual effects that need the SETTLE signal, not
  // just the fire). Only `useReadAloudEnabled` is swapped, for a controllable
  // fixture (no <ReadAloudDefaultProvider> exists in this suite's tree, since
  // `EchoRound` is invoked directly, not rendered).
  ...(await importActual<typeof import("../_shared/useSpeakOnce")>()),
  useReadAloudEnabled: () => fixtures.readAloudEnabled,
}));
vi.mock("../_shared/useWrongShake", () => ({
  useWrongShake: () => ({ wrong: false, ...fixtures.wrongShake }),
}));
vi.mock("../_shared/typing/useTypingKeys", () => ({
  // Unlike the sibling mocks, this one honors `active`: once the Player
  // detaches (active=false), the captured handler is nulled out, so a
  // `type()`/`backspace()` call after completion reaches nothing — the exact
  // thing the carried-forward Task 2 review asked this suite to assert.
  useTypingKeys: (onIntent: (intent: KeyIntent) => void, active: boolean) => {
    fixtures.onIntent = active ? onIntent : null;
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
  EchoRound,
  holdForSequenceSpeech,
  INSTRUCTION_HARD_CEILING_MS,
  INSTRUCTION_SETTLE_FALLBACK_MS,
  TypingEchoPlayer,
} from "./Player";

function renderRound(
  config: TypingEchoConfig,
  onComplete: (response: TypingEchoResponse) => void,
): ReactElement {
  fixtures.refIndex = 0;
  fixtures.stateIndex = 0;
  return EchoRound({ config, onComplete }) as ReactElement;
}

function toMarkup(
  config: TypingEchoConfig,
  onComplete: (response: TypingEchoResponse) => void,
): string {
  return renderToStaticMarkup(renderRound(config, onComplete));
}

function type(char: string, shiftKey = false): void {
  fixtures.onIntent?.({ type: "char", char, code: `Key${char.toUpperCase()}`, shiftKey });
}

function backspace(): void {
  fixtures.onIntent?.({ type: "backspace" });
}

/** Flips the round's own state into recall for its current index — the flash
 *  countdown itself is driven by a `window.setInterval` this window-less
 *  suite can't observe, so recall is entered the same way the sibling suites
 *  reach paths a real tick can't: by poking the captured state directly, then
 *  re-rendering so the Player's handlers close over the new phase. */
function advanceToRecall(onComplete: (response: TypingEchoResponse) => void): void {
  const current = fixtures.stateValues[0] as EchoState;
  fixtures.stateValues[0] = { ...current, phase: "recall" as const };
  renderRound(CONFIG, onComplete);
}

/** Lets the instruction-settle effect's queued microtask run (ITEM 1), then
 *  re-renders so the Player's next pass sees `instructionSettled`. One
 *  `await` is enough: `speech.speak(...).then(cb)` queues `cb` the instant
 *  `renderRound` runs (the mocked `useEffect` executes synchronously), ahead
 *  of this `await`'s own continuation in the microtask queue. */
async function settleInstruction(onComplete: (response: TypingEchoResponse) => void): Promise<void> {
  await Promise.resolve();
  renderRound(CONFIG, onComplete);
}

const CONFIG: TypingEchoConfig = {
  instruction: "Watch, then type what you saw.",
  sequences: ["fj", "dk", "sl"],
  flashMs: 1200,
};

beforeEach(() => {
  fixtures.refIndex = 0;
  fixtures.refValues = [];
  fixtures.stateIndex = 0;
  fixtures.stateValues = [];
  fixtures.paused = false;
  fixtures.documentHidden = false;
  fixtures.reducedMotion = false;
  fixtures.readAloudEnabled = true;
  fixtures.onIntent = null;
  fixtures.speech.speak = vi.fn(() => Promise.resolve<SpeechPlaybackOutcome>("completed"));
  vi.clearAllMocks();
});

describe("TypingEchoPlayer shell", () => {
  it("mounts through TypingStage with the given onExit, wrapping only EchoRound (req 1)", () => {
    const onExit = () => undefined;
    const element = TypingEchoPlayer({
      config: CONFIG,
      onComplete: () => undefined,
      onExit,
    }) as ReactElement<{ onExit?: () => void; children: ReactElement }>;

    expect(element.type).toBe(TypingStage);
    expect(element.props.onExit).toBe(onExit);
    expect(element.props.children.type).toBe(EchoRound);
  });
});

describe("Star Echo flash phase", () => {
  it("renders the expected tiles and announces the sequence (req 3, 5)", () => {
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toContain("data-expected-word-group");
    expect(markup).toMatch(/>f</);
    expect(markup).toMatch(/>j</);
    expect(markup).toContain("Watch: f, then j");
    expect(markup).not.toContain("Now type what you saw");
  });

  it("ignores keystrokes entirely — no shake, no buffer change (req 3)", () => {
    renderRound(CONFIG, () => undefined);

    type("f");
    type("x");

    expect(fixtures.wrongShake.trigger).not.toHaveBeenCalled();
    const state = fixtures.stateValues[0] as EchoState;
    expect(state.phase).toBe("flash");
    expect(state.progress.typed).toEqual([]);
    expect(state.results).toEqual([]);
  });

  it("shows the fill-up star row and N of M progress hint (req 6)", () => {
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toMatch(
      /<span aria-hidden="true" class="flex flex-wrap items-center justify-center gap-1.5">/,
    );
    expect(markup).toContain("1 of 3");
  });
});

describe("Star Echo instruction-gated first flash (ITEM 1)", () => {
  it("speaks the instruction on mount, before anything else", () => {
    renderRound(CONFIG, () => undefined);

    expect(fixtures.speech.speak).toHaveBeenCalledWith(CONFIG.instruction);
  });

  /**
   * Round-3 refactor note: the sequence is now spoken by a manual effect
   * that calls `speech.speak()` directly (not via the mocked `useSpeakOnce`)
   * — see `holdForSequenceSpeech`'s doc comment — so these assertions read
   * `fixtures.speech.speak`'s OWN call list rather than `fixtures.speakOnce`.
   */
  it("does not speak the sequence's essential-content audio until the instruction resolves", async () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    // Synchronously after mount, the instruction hasn't settled yet — the
    // sequence's own speech must stay gated, not race it.
    expect(fixtures.speech.speak).not.toHaveBeenCalledWith("f, then j");

    await settleInstruction(onComplete);
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
  });

  it("still starts the round, via a short fallback, when speech resolves unavailable (unsupported engine)", async () => {
    vi.useFakeTimers();
    try {
      fixtures.speech.speak = vi.fn(() => Promise.resolve<SpeechPlaybackOutcome>("unavailable"));
      const onComplete = vi.fn();
      renderRound(CONFIG, onComplete);

      await settleInstruction(onComplete);
      // The "unavailable" branch schedules a fallback timer rather than
      // settling immediately — the sequence hasn't been asked to speak yet.
      expect(fixtures.speech.speak).not.toHaveBeenCalledWith("f, then j");

      await vi.advanceTimersByTimeAsync(INSTRUCTION_SETTLE_FALLBACK_MS);
      renderRound(CONFIG, onComplete);
      expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Round-3 follow-up: a real headless-Chromium `speechSynthesis` engine can
   * leave an utterance queued forever, firing neither `onend` nor `onerror` —
   * `speech.speak()`'s promise then never settles at all (this exact gap
   * hung the e2e gate under `CI=1`). `INSTRUCTION_SETTLE_FALLBACK_MS` cannot
   * help here since it only runs once the promise DOES resolve. Without
   * `INSTRUCTION_HARD_CEILING_MS`'s independent timer, this round never
   * starts.
   */
  it("still starts the round, via a hard ceiling, when speech never settles at all", async () => {
    vi.useFakeTimers();
    try {
      fixtures.speech.speak = vi.fn(() => new Promise<SpeechPlaybackOutcome>(() => {}));
      const onComplete = vi.fn();
      renderRound(CONFIG, onComplete);

      await vi.advanceTimersByTimeAsync(INSTRUCTION_HARD_CEILING_MS - 1);
      renderRound(CONFIG, onComplete);
      expect(fixtures.speech.speak).not.toHaveBeenCalledWith("f, then j");

      await vi.advanceTimersByTimeAsync(1);
      renderRound(CONFIG, onComplete);
      expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wait at all when the read-aloud default is off (nothing will be spoken)", async () => {
    fixtures.readAloudEnabled = false;
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    await settleInstruction(onComplete);

    expect(fixtures.speech.speak).not.toHaveBeenCalledWith(CONFIG.instruction);
    // Gated only on `instructionSettled` now, which resolved synchronously —
    // the essential-content flash speech (unaffected by the toggle) fires.
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
  });
});

describe("Star Echo essential-content flash speech settling (ITEM 4 judgment call)", () => {
  /**
   * The judgment call, made concrete: truncation is unacceptable for a
   * blind child, so `flashMs` alone must not end the flash. `tickEcho`
   * itself doesn't know about speech — the Player holds the transition via
   * `holdForSequenceSpeech`, a pure function kept separate exactly so this
   * decision is testable without a real interval (a no-op in this suite).
   */
  it("holds a flash -> recall transition when the episode's speech hasn't settled", () => {
    expect(holdForSequenceSpeech("flash", "recall", false)).toBe(true);
  });

  it("lets a flash -> recall transition through once speech has settled", () => {
    expect(holdForSequenceSpeech("flash", "recall", true)).toBe(false);
  });

  it("never holds a tick that doesn't cross into recall (nothing to guard yet)", () => {
    expect(holdForSequenceSpeech("flash", "flash", false)).toBe(false);
  });

  it("never holds a transition that didn't start in flash (recall -> flash, e.g. a completed item)", () => {
    expect(holdForSequenceSpeech("recall", "flash", false)).toBe(false);
  });
});

describe("Star Echo recall phase — the leak guard (§8, req 3, 5)", () => {
  it("hides the expected tiles entirely and never leaks the sequence text", () => {
    renderRound(CONFIG, () => undefined);
    fixtures.stateValues[0] = { ...(fixtures.stateValues[0] as EchoState), phase: "recall" };
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).not.toContain("data-expected-word-group");
    expect(markup).not.toContain("data-expected-position");
    expect(markup).not.toContain("Watch:");
    expect(markup).toContain("Now type what you saw");
    for (const ch of CONFIG.sequences[0]!) {
      expect(markup).not.toContain(`>${ch}<`);
    }
  });

  it("shows the eye-closed affordance and the (empty) buffer, not the answer", () => {
    renderRound(CONFIG, () => undefined);
    fixtures.stateValues[0] = { ...(fixtures.stateValues[0] as EchoState), phase: "recall" };
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toContain('data-typing-buffer="true"');
    expect(markup).not.toContain("data-buffer-position");
  });

  it("shakes on a wrong key and swaps the announcement to the Backspace line, with a strike-through wrong tile (req 4, 5)", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    advanceToRecall(onComplete);

    type("x"); // "fj" expects "f" first

    expect(fixtures.wrongShake.trigger).toHaveBeenCalledTimes(1);
    const markup = toMarkup(CONFIG, onComplete);
    expect(markup).toContain("Press Backspace to fix it");
    expect(markup).toContain('data-backspace-hint="true"');
    expect(markup).toMatch(/bg-coral\/55[^"]*line-through/);
  });

  it("recovers after Backspace and re-shakes on a repeated wrong key", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    advanceToRecall(onComplete);

    type("x");
    backspace();
    const recovered = toMarkup(CONFIG, onComplete);
    expect(recovered).not.toContain("Press Backspace to fix it");

    fixtures.wrongShake.trigger.mockClear();
    type("x");
    expect(fixtures.wrongShake.trigger).toHaveBeenCalledTimes(1);
  });

  it("extends the leak guard to the speech mock (ITEM 4): the sequence speaks during flash but never during recall", async () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    await settleInstruction(onComplete); // lets the essential-content flash speech open

    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");

    fixtures.speech.speak.mockClear();
    advanceToRecall(onComplete);
    expect(fixtures.speech.speak).not.toHaveBeenCalledWith("f, then j");
  });

  /**
   * Round-3 follow-up: `useSpeakOnce` above only guards against a NEW
   * utterance starting during recall — it says nothing about one already
   * in flight finishing its sentence into recall (a slow/queued TTS route
   * is the normal case, not an edge case). This is the actual §8 leak fix:
   * without the `speech.cancel()` effect, this test fails, because nothing
   * else in this suite ever calls `fixtures.speech.cancel`.
   */
  it("cancels any in-flight flash speech the instant phase flips flash -> recall", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    fixtures.speech.cancel.mockClear();
    expect(fixtures.speech.cancel).not.toHaveBeenCalled();

    advanceToRecall(onComplete);

    expect(fixtures.speech.cancel).toHaveBeenCalled();
  });

  it("cancels again on a re-flash's own flash -> recall exit, not just the first one", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    advanceToRecall(onComplete);
    fixtures.speech.cancel.mockClear();

    // Simulate a reflash (ITEM 2): back to flash for the same sequence —
    // nothing to cancel yet, since recall hasn't been (re-)entered.
    fixtures.stateValues[0] = { ...(fixtures.stateValues[0] as EchoState), phase: "flash" as const };
    renderRound(CONFIG, onComplete);
    expect(fixtures.speech.cancel).not.toHaveBeenCalled();

    advanceToRecall(onComplete); // the reflash's own flash -> recall exit
    expect(fixtures.speech.cancel).toHaveBeenCalled();
  });
});

describe("Star Echo pause (req 2)", () => {
  it("shows the pause overlay while paused", () => {
    fixtures.paused = true;
    const markup = toMarkup(CONFIG, () => undefined);

    expect(markup).toContain("Paused — click to keep playing");
  });

  it("detaches the key listener while paused, matching typing-race/typing-catch (ITEM 9)", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    advanceToRecall(onComplete);
    expect(fixtures.onIntent).not.toBeNull();

    fixtures.paused = true;
    renderRound(CONFIG, onComplete);

    expect(fixtures.onIntent).toBeNull();
  });
});

describe("Star Echo reduced motion (req 8)", () => {
  it("passes reducedMotion through to the shake (recall renders the shake wrapper) so it can collapse to identity", () => {
    fixtures.reducedMotion = true;
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    advanceToRecall(onComplete);

    expect(fixtures.wrongShake.shakeProps).toHaveBeenCalledWith(true);
  });
});

describe("Star Echo completion (§8)", () => {
  it("reports all 3 sequences in order with no `typed` property for a perfect run", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    for (const sequence of CONFIG.sequences) {
      advanceToRecall(onComplete);
      for (const ch of sequence) type(ch);
    }
    renderRound(CONFIG, onComplete); // lets the completion effect run

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0]![0] as TypingEchoResponse;

    expect(payload.sequences).toHaveLength(3);
    payload.sequences.forEach((result, i) => {
      expect(result).toMatchObject({ i, ok: true, retries: 0, missedExpected: [] });
      expect(result).not.toHaveProperty("typed");
    });
  });

  it("carries retries:1 and only the expected missed character for a wrong-then-backspace item", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    advanceToRecall(onComplete);

    type("x");
    backspace();
    type("f");
    type("j"); // completes "fj" with 1 retry

    for (const sequence of CONFIG.sequences.slice(1)) {
      advanceToRecall(onComplete);
      for (const ch of sequence) type(ch);
    }
    renderRound(CONFIG, onComplete);

    const payload = onComplete.mock.calls[0]![0] as TypingEchoResponse;
    expect(payload.sequences[0]).toMatchObject({
      i: 0,
      ok: false,
      retries: 1,
      missedExpected: ["f"],
    });
    for (const result of payload.sequences) {
      expect(result.missedExpected).not.toContain("x");
    }
  });

  it("shows the cheering Mascot and detaches the key listener once finished (carried-forward Task 2 review)", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    for (const sequence of CONFIG.sequences) {
      advanceToRecall(onComplete);
      for (const ch of sequence) type(ch);
    }
    const markup = toMarkup(CONFIG, onComplete);

    expect(markup).toContain("Star Echo complete");
    expect(fixtures.onIntent).toBeNull();

    // A stray keystroke after completion must reach nothing — pressEchoKey's
    // `expected === undefined` branch stays provably unreachable.
    type("z");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("Star Echo pure state re-export sanity", () => {
  it("initialEchoState still starts in flash (guards the recall-poke helper above against drift)", () => {
    expect(initialEchoState(0).phase).toBe("flash");
  });
});
