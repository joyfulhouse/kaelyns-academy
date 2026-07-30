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
  // Round 4: captured per effect call-site (index-cursor, same technique as
  // refs/state above) so a test can simulate React's own mount -> cleanup ->
  // mount replay (what StrictMode does deliberately in dev, and exactly the
  // sequence a reviewer found this file's OLD instruction/sequence-speech
  // effects couldn't survive) — see `replayEffects` below.
  effectIndex: 0,
  effectCleanups: [] as (void | (() => void))[],
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
    const index = fixtures.effectIndex++;
    fixtures.effectCleanups[index] = effect();
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
  speechIsReady,
  TypingEchoPlayer,
} from "./Player";

function renderRound(
  config: TypingEchoConfig,
  onComplete: (response: TypingEchoResponse) => void,
): ReactElement {
  fixtures.refIndex = 0;
  fixtures.stateIndex = 0;
  fixtures.effectIndex = 0;
  return EchoRound({ config, onComplete }) as ReactElement;
}

/**
 * Simulates a React mount -> cleanup -> mount replay (what StrictMode does
 * deliberately in dev to catch effects that aren't safe to run twice, and
 * the exact sequence a reviewer found stranded the OLD instruction/sequence-
 * speech effects: cleanup cleared their `setTimeout`, then the guard that
 * would rearm it blocked a second attempt). Runs every captured cleanup
 * from the LAST render, then re-renders — refs/state persist across this
 * (exactly like real React), so this proves whether a round's forward
 * progress depends on anything a cleanup could discard.
 */
function replayEffects(
  config: TypingEchoConfig,
  onComplete: (response: TypingEchoResponse) => void,
): void {
  for (const cleanup of fixtures.effectCleanups) {
    cleanup?.();
  }
  renderRound(config, onComplete);
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

/**
 * Round 4: `instructionSettled` is set ONLY from inside the tick interval's
 * `window.setInterval` callback (a no-op in this window-less suite — see the
 * file-header comment) — never from a promise `.then()` anymore, exactly so
 * a lost effect replay can't strand it (see `INSTRUCTION_HARD_CEILING_MS`'s
 * doc comment in Player.tsx). So this suite simulates the interval's own
 * conclusion the same way `advanceToRecall` simulates a tick it can't run:
 * poking the state slot directly, then re-rendering. Slot 1 is
 * `instructionSettled` (`useState<EchoState>` claims slot 0 first).
 */
function settleInstruction(onComplete: (response: TypingEchoResponse) => void): void {
  fixtures.stateValues[1] = true;
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
  fixtures.effectIndex = 0;
  fixtures.effectCleanups = [];
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

  it("does not speak the sequence's essential-content audio until the instruction settles", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    // Synchronously after mount, the instruction hasn't settled yet — the
    // sequence's own speech must stay gated, not race it.
    expect(fixtures.speech.speak).not.toHaveBeenCalledWith("f, then j");

    settleInstruction(onComplete);
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
  });

  it("does not wait at all when the read-aloud default is off (nothing will be spoken)", () => {
    fixtures.readAloudEnabled = false;
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);

    expect(fixtures.speech.speak).not.toHaveBeenCalledWith(CONFIG.instruction);
    // `instructionSettled`'s lazy initializer resolves this synchronously on
    // the FIRST render, with no interval tick needed — the essential-content
    // flash speech (unaffected by the toggle) fires immediately.
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
  });

  it("keeps the unavailable-engine fallback strictly shorter than the hard ceiling (required for the shortening in Player.tsx's kickoff effect to actually shorten anything)", () => {
    expect(INSTRUCTION_SETTLE_FALLBACK_MS).toBeLessThan(INSTRUCTION_HARD_CEILING_MS);
  });

  it("still functions when speech resolves 'unavailable' (unsupported engine, no voice) — the round is not left throwing or stuck", () => {
    fixtures.speech.speak = vi.fn(() => Promise.resolve<SpeechPlaybackOutcome>("unavailable"));
    const onComplete = vi.fn();

    expect(() => {
      renderRound(CONFIG, onComplete);
      // Simulates the interval discovering readiness via the shortened
      // fallback deadline (INSTRUCTION_SETTLE_FALLBACK_MS) rather than the
      // full hard ceiling — the exact timing isn't independently observable
      // at this level (same caveat as the doc comment below), only that the
      // round still proceeds rather than hanging on the "unavailable" branch.
      settleInstruction(onComplete);
    }).not.toThrow();
    expect(fixtures.speech.speak).toHaveBeenCalledWith(CONFIG.instruction);
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
  });

  /**
   * Round-4 structural note (the class-level fix, not another patch): the
   * ACTUAL release mechanism — a `window.setInterval` polling
   * `speechIsReady(fastSignal, now, deadline)` every 100ms — cannot run in
   * this suite (no `window`; see the file-header comment), so it is not
   * unit-testable end to end here. What IS unit-tested, exhaustively, is the
   * pure `speechIsReady`/`holdForSequenceSpeech` release RULE below (every
   * combination of settled/deadline-passed), which is the part that used to
   * be a `setTimeout` a cleanup could drop — it no longer exists at all, so
   * there is nothing left for a replay to lose. What's tested here, at the
   * kickoff-effect level, is that the guard survives being invoked multiple
   * times (this suite's `useEffect` mock runs every effect body on every
   * render, unlike real React — a strictly HARDER case than a single
   * StrictMode replay) without ever double-speaking. The full mechanism —
   * kickoff writes a ref, the interval reads it fresh every tick regardless
   * of whether the kickoff effect ever runs again — is verified end to end
   * by the real e2e suite (`e2e/specs/typing.spec.ts`), which exercises an
   * actual browser `speechSynthesis` engine and an actual `setInterval`.
   */
  it("still functions when the instruction's speech promise never settles at all — the round is not left throwing or stuck mid-render", () => {
    fixtures.speech.speak = vi.fn(() => new Promise<SpeechPlaybackOutcome>(() => {}));
    const onComplete = vi.fn();

    expect(() => {
      renderRound(CONFIG, onComplete);
      // Simulates the interval eventually deciding readiness via the
      // deadline (see the doc comment above) — the rest of the pipeline
      // must work identically regardless of whether the original promise
      // ever resolved.
      settleInstruction(onComplete);
    }).not.toThrow();
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");
  });

  /**
   * The P1 this file exists to guard against: the OLD kickoff effect's
   * cleanup cleared its `setTimeout` hard-ceiling, and the `instructionStarted`
   * guard then blocked a replay from rearming it — so a mount -> cleanup ->
   * mount replay (exactly what React StrictMode does deliberately in dev,
   * reportedly reproduced with read-aloud off) permanently stranded the
   * round on an utterance that never settles. `replayEffects` now runs this
   * effect's REAL cleanup (captured per call-site by the mock above) before
   * re-mounting, so this is a genuine replay, not just another same-render
   * call. What this proves: the kickoff effect has no cleanup left to lose
   * anything from (calling `speech.speak` exactly once, never twice, across
   * repeated replays — an audible restart would itself be a bug) and does
   * not throw. What it CANNOT prove from here: whether the round actually
   * reaches recall afterward — that requires the tick interval
   * (`window.setInterval`) to run and read the deadline ref this effect
   * wrote, and that interval is a no-op in this suite's window-less
   * environment (see the file-header comment). That end-to-end guarantee is
   * covered by `speechIsReady`'s exhaustive pure-function tests above (the
   * exact release rule the interval evaluates) plus the real e2e run
   * (`e2e/specs/typing.spec.ts`), not by this test.
   */
  it("survives a genuine mount -> cleanup -> mount replay while speech never settles, without re-speaking or throwing", () => {
    fixtures.speech.speak = vi.fn(() => new Promise<SpeechPlaybackOutcome>(() => {}));
    const onComplete = vi.fn();

    renderRound(CONFIG, onComplete);
    expect(fixtures.speech.speak).toHaveBeenCalledTimes(1);

    expect(() => replayEffects(CONFIG, onComplete)).not.toThrow();
    expect(fixtures.speech.speak).toHaveBeenCalledTimes(1);

    // A second replay too, not just one — StrictMode's own replay is a
    // single extra pass, but nothing about this fix should depend on that
    // being the only one that ever happens.
    expect(() => replayEffects(CONFIG, onComplete)).not.toThrow();
    expect(fixtures.speech.speak).toHaveBeenCalledTimes(1);
  });
});

describe("speechIsReady (round-4 structural fix — the deadline comparison)", () => {
  it("is not ready when neither the fast signal nor the deadline has arrived", () => {
    expect(speechIsReady(false, 100, 200)).toBe(false);
  });

  it("is ready the instant the fast signal arrives, even well before the deadline", () => {
    expect(speechIsReady(true, 100, 999_999)).toBe(true);
  });

  it("is ready once the deadline passes, even with no fast signal at all", () => {
    expect(speechIsReady(false, 200, 200)).toBe(true);
    expect(speechIsReady(false, 201, 200)).toBe(true);
  });

  it("is ready under the exact real constants: unsettled at HARD_CEILING - 1, ready at HARD_CEILING", () => {
    expect(speechIsReady(false, INSTRUCTION_HARD_CEILING_MS - 1, INSTRUCTION_HARD_CEILING_MS)).toBe(false);
    expect(speechIsReady(false, INSTRUCTION_HARD_CEILING_MS, INSTRUCTION_HARD_CEILING_MS)).toBe(true);
  });
});

describe("Star Echo essential-content flash speech settling (ITEM 4 judgment call)", () => {
  /**
   * The judgment call, made concrete: truncation is unacceptable for a
   * blind child, so `flashMs` alone must not end the flash. `tickEcho`
   * itself doesn't know about speech — the Player holds the transition via
   * `holdForSequenceSpeech`, a pure function kept separate exactly so this
   * decision is testable without a real interval (a no-op in this suite).
   * Round 4: the release rule is now the same deadline comparison as the
   * instruction gate (`speechIsReady`), not a `setTimeout`-armed ref.
   */
  it("holds a flash -> recall transition when the episode's speech hasn't settled and the deadline hasn't passed", () => {
    expect(holdForSequenceSpeech("flash", "recall", false, 100, 200)).toBe(true);
  });

  it("lets a flash -> recall transition through once speech has settled, even before the deadline", () => {
    expect(holdForSequenceSpeech("flash", "recall", true, 100, 999_999)).toBe(false);
  });

  it("lets a flash -> recall transition through once the deadline passes, even with speech unsettled", () => {
    expect(holdForSequenceSpeech("flash", "recall", false, 200, 200)).toBe(false);
  });

  it("never holds a tick that doesn't cross into recall (nothing to guard yet)", () => {
    expect(holdForSequenceSpeech("flash", "flash", false, 100, 200)).toBe(false);
  });

  it("never holds a transition that didn't start in flash (recall -> flash, e.g. a completed item)", () => {
    expect(holdForSequenceSpeech("recall", "flash", false, 100, 200)).toBe(false);
  });
});

describe("Star Echo sequence-speech epoch guard (a stale settle from a superseded episode)", () => {
  /**
   * The sequence-speech effect re-arms per episode (unlike the instruction
   * kickoff, a one-shot singleton) — so an earlier episode's `speech.speak()`
   * promise can still be pending, and later resolve, well after the round
   * has moved on to a NEW episode that already reset the settled ref to
   * false for itself. Without comparing the resolving promise against the
   * key it was actually spoken for, that late resolution would wrongly mark
   * the NEW episode as settled — releasing its flash -> recall transition
   * before its own utterance actually finished, exactly the truncation this
   * whole mechanism exists to prevent. `sequenceSpeechSettledRef` isn't
   * exposed for direct assertion, and the interval that would act on it is a
   * no-op in this suite (see the file-header comment) — what's provable here
   * is that a superseded promise resolving late is inert: the round moves on
   * to the next sequence's speech normally, and settling the stale one
   * afterwards doesn't throw or otherwise disturb it.
   */
  it("moves on to the next sequence's speech normally, and a stale settle from the previous episode doesn't disturb it", () => {
    let resolveFirst: ((outcome: SpeechPlaybackOutcome) => void) | undefined;
    let speakCallCount = 0;
    // Kept zero-arg (matching the fixture's declared shape above) and
    // branches on call ORDER instead of inspecting the argument: calls, in
    // order, are (1) the instruction, (2) episode 0's own speech
    // ("f, then j") — the one left hanging — and (3) episode 1's own speech
    // ("d, then k"). The established call order (instruction first, per
    // "speaks the instruction on mount, before anything else" above) makes
    // this deterministic.
    fixtures.speech.speak = vi.fn(() => {
      speakCallCount += 1;
      if (speakCallCount === 2) {
        return new Promise<SpeechPlaybackOutcome>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve<SpeechPlaybackOutcome>("completed");
    });
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    settleInstruction(onComplete);
    expect(fixtures.speech.speak).toHaveBeenCalledWith("f, then j");

    advanceToRecall(onComplete);
    for (const ch of "fj") type(ch);
    renderRound(CONFIG, onComplete); // lets the second sequence's speech effect run

    expect(fixtures.speech.speak).toHaveBeenCalledWith("d, then k");

    expect(() => resolveFirst?.("completed")).not.toThrow();
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

  it("extends the leak guard to the speech mock (ITEM 4): the sequence speaks during flash but never during recall", () => {
    const onComplete = vi.fn();
    renderRound(CONFIG, onComplete);
    settleInstruction(onComplete); // lets the essential-content flash speech open

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
