import { describe, expect, it } from "vitest";
import type { TypingCharIntent } from "../_shared/typing/typingKey";
import {
  REFLASH_RETRIES,
  initialEchoState,
  isEchoComplete,
  pressEchoBackspace,
  pressEchoKey,
  tickEcho,
} from "./state";

const SEQUENCES = ["fj", "dk", "Sl"];

function key(char: string, shiftKey = false): Pick<TypingCharIntent, "char" | "shiftKey"> {
  return { char, shiftKey };
}

describe("Star Echo state", () => {
  it("starts in flash at index 0 with empty progress and results", () => {
    const state = initialEchoState(0);
    expect(state.index).toBe(0);
    expect(state.phase).toBe("flash");
    expect(state.phaseStartedMs).toBe(0);
    expect(state.progress).toEqual({
      typed: [],
      retries: 0,
      missedExpected: [],
      diverged: false,
      startedMs: null,
      completedMs: null,
    });
    expect(state.results).toEqual([]);
  });

  it("tickEcho stays in flash before flashMs elapses, reference-equal", () => {
    const state = initialEchoState(1_000);
    const next = tickEcho(state, 1_200, 2_199);
    expect(next).toBe(state);
    expect(next.phase).toBe("flash");
  });

  it("tickEcho flips to recall at exactly flashMs elapsed", () => {
    const state = initialEchoState(1_000);
    const next = tickEcho(state, 1_200, 2_200);
    expect(next.phase).toBe("recall");
    expect(next.phaseStartedMs).toBe(2_200);
    expect(next).not.toBe(state);
  });

  it("tickEcho is a no-op once already in recall", () => {
    const flashed = tickEcho(initialEchoState(0), 1_200, 1_200);
    const next = tickEcho(flashed, 1_200, 5_000);
    expect(next).toBe(flashed);
  });

  it("ignores keys during flash — reference-equal, progress untouched", () => {
    const state = initialEchoState(0);
    const next = pressEchoKey(state, SEQUENCES, key("f"), 500);
    expect(next).toBe(state);
    expect(next.progress).toBe(state.progress);
  });

  it("ignores Backspace during flash — reference-equal", () => {
    const state = initialEchoState(0);
    const next = pressEchoBackspace(state, 500);
    expect(next).toBe(state);
  });

  it("advances the buffer on a key during recall", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = pressEchoKey(state, SEQUENCES, key("f"), 1_300);
    expect(state.phase).toBe("recall");
    expect(state.progress.typed).toEqual([{ char: "f", ok: true }]);
    expect(state.index).toBe(0);
  });

  it("completing a sequence banks the result, advances index, resets progress, and returns to flash", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = pressEchoKey(state, SEQUENCES, key("f"), 1_300);
    state = pressEchoKey(state, SEQUENCES, key("j"), 1_400);

    expect(state.index).toBe(1);
    expect(state.phase).toBe("flash");
    expect(state.phaseStartedMs).toBe(1_400);
    expect(state.progress).toEqual({
      typed: [],
      retries: 0,
      missedExpected: [],
      diverged: false,
      startedMs: null,
      completedMs: null,
    });
    expect(state.results).toEqual([
      { i: 0, ok: true, ms: 100, retries: 0, missedExpected: [] },
    ]);
  });

  it("a wrong key then Backspace records retries:1 with exactly one in-sequence missedExpected", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = pressEchoKey(state, SEQUENCES, key("d"), 1_300); // wrong: expected "f"
    expect(state.progress.diverged).toBe(true);
    state = pressEchoBackspace(state, 1_350);
    expect(state.progress.diverged).toBe(false);
    expect(state.progress.retries).toBe(1);
    expect(state.progress.missedExpected).toEqual(["f"]);

    state = pressEchoKey(state, SEQUENCES, key("f"), 1_400);
    state = pressEchoKey(state, SEQUENCES, key("j"), 1_500);
    expect(state.results).toEqual([
      { i: 0, ok: false, ms: 200, retries: 1, missedExpected: ["f"] },
    ]);
  });

  it("isEchoComplete is true only once every sequence has been recalled", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = pressEchoKey(state, SEQUENCES, key("f"), 1_300);
    state = pressEchoKey(state, SEQUENCES, key("j"), 1_400);
    expect(isEchoComplete(state, SEQUENCES.length)).toBe(false);

    state = tickEcho(state, 1_200, state.phaseStartedMs + 1_200);
    state = pressEchoKey(state, SEQUENCES, key("d"), state.phaseStartedMs + 100);
    state = pressEchoKey(state, SEQUENCES, key("k"), state.phaseStartedMs + 200);
    expect(isEchoComplete(state, SEQUENCES.length)).toBe(false);

    state = tickEcho(state, 1_200, state.phaseStartedMs + 1_200);
    state = pressEchoKey(state, SEQUENCES, key("s", true), state.phaseStartedMs + 100);
    state = pressEchoKey(state, SEQUENCES, key("l"), state.phaseStartedMs + 200);
    expect(isEchoComplete(state, SEQUENCES.length)).toBe(true);
  });

  it("banks index-ordered results with exact-case missedExpected across a full round", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = pressEchoKey(state, SEQUENCES, key("f"), 1_300);
    state = pressEchoKey(state, SEQUENCES, key("j"), 1_400);

    state = tickEcho(state, 1_200, state.phaseStartedMs + 1_200);
    state = pressEchoKey(state, SEQUENCES, key("d"), state.phaseStartedMs + 100);
    state = pressEchoKey(state, SEQUENCES, key("k"), state.phaseStartedMs + 200);

    state = tickEcho(state, 1_200, state.phaseStartedMs + 1_200);
    // Wrong case (no Shift) against the capital target "S" must miss exactly "S", not "s".
    state = pressEchoKey(state, SEQUENCES, key("s"), state.phaseStartedMs + 100);
    state = pressEchoBackspace(state, state.phaseStartedMs + 150);
    state = pressEchoKey(state, SEQUENCES, key("s", true), state.phaseStartedMs + 200);
    state = pressEchoKey(state, SEQUENCES, key("l"), state.phaseStartedMs + 300);

    expect(state.results.map((r) => r.i)).toEqual([0, 1, 2]);
    expect(state.results).toEqual([
      { i: 0, ok: true, ms: 100, retries: 0, missedExpected: [] },
      { i: 1, ok: true, ms: 100, retries: 0, missedExpected: [] },
      { i: 2, ok: false, ms: 200, retries: 1, missedExpected: ["S"] },
    ]);
  });
});

describe("Star Echo reflash — recovery from an unrecoverable miss (ITEM 2)", () => {
  /** Wrong key at position 0, then Backspace to fix it — one "correction episode". */
  function correctionEpisode(state: ReturnType<typeof tickEcho>, atMs: number) {
    let next = pressEchoKey(state, SEQUENCES, key("x"), atMs); // "fj" expects "f" first
    expect(next.progress.diverged).toBe(true);
    next = pressEchoBackspace(next, atMs + 10);
    return next;
  }

  it("stays put after 1 correction episode, reference-equal on the resolving Backspace", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);

    expect(state.phase).toBe("recall");
    expect(state.progress.retries).toBe(1);
  });

  it("REFLASH_RETRIES (2) correction episodes re-flashes the sequence: phase flips back to flash with a fresh phaseStartedMs", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);
    state = correctionEpisode(state, 1_400);

    expect(REFLASH_RETRIES).toBe(2);
    expect(state.phase).toBe("flash");
    expect(state.phaseStartedMs).toBe(1_410); // the SECOND episode's resolving Backspace, atMs + 10
    expect(state.index).toBe(0); // still the same sequence — not advanced, not skipped
  });

  it("the re-flash shows the sequence again (ExpectedTiles renders on phase === 'flash')", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);
    state = correctionEpisode(state, 1_400);

    expect(state.phase).toBe("flash");
    // The buffer is cleared, not left showing the two wrong/backspaced attempts.
    expect(state.progress.typed).toEqual([]);
  });

  it("keys are ignored during the re-flash, exactly like the initial flash", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);
    state = correctionEpisode(state, 1_400);
    expect(state.phase).toBe("flash");

    const afterKey = pressEchoKey(state, SEQUENCES, key("f"), 1_500);
    expect(afterKey).toBe(state);
    const afterBackspace = pressEchoBackspace(state, 1_500);
    expect(afterBackspace).toBe(state);
  });

  it("does NOT reset retries or missedExpected across the reflash", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);
    state = correctionEpisode(state, 1_400);

    expect(state.progress.retries).toBe(2);
    expect(state.progress.missedExpected).toEqual(["f"]);
  });

  it("the item still completes and reports retries:2 and the struggle's missedExpected afterwards", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);
    state = correctionEpisode(state, 1_400);
    expect(state.phase).toBe("flash");

    // The re-flash's own clock: ticks back to recall after flashMs.
    state = tickEcho(state, 1_200, state.phaseStartedMs + 1_200);
    expect(state.phase).toBe("recall");

    state = pressEchoKey(state, SEQUENCES, key("f"), state.phaseStartedMs + 100);
    state = pressEchoKey(state, SEQUENCES, key("j"), state.phaseStartedMs + 200);

    expect(state.index).toBe(1);
    // ms is startedMs (the FIRST keypress, before either correction episode)
    // through the eventual completedMs — the reflash doesn't reset the clock,
    // so it honestly includes the whole struggle, not just the final retry.
    expect(state.results).toEqual([
      { i: 0, ok: false, ms: 1_510, retries: 2, missedExpected: ["f"] },
    ]);
  });

  it("re-flashes again if the struggle continues (every REFLASH_RETRIES more episodes, not just once)", () => {
    let state = tickEcho(initialEchoState(0), 1_200, 1_200);
    state = correctionEpisode(state, 1_300);
    state = correctionEpisode(state, 1_400); // 1st reflash at retries:2
    expect(state.phase).toBe("flash");

    state = tickEcho(state, 1_200, state.phaseStartedMs + 1_200); // back to recall
    state = correctionEpisode(state, state.phaseStartedMs + 100); // retries:3, no reflash yet
    state = correctionEpisode(state, state.phaseStartedMs + 200); // retries:4 -> 2nd reflash

    expect(state.progress.retries).toBe(4);
    expect(state.phase).toBe("flash");
  });
});
