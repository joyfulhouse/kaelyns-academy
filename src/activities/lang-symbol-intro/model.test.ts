import { describe, expect, it } from "vitest";
import {
  activateExample,
  activateSymbol,
  advanceSymbolBatch,
  advanceSymbolCheck,
  chooseSymbolAnswer,
  createSymbolBatches,
  createSymbolIntroState,
  toggleSymbolHelp,
} from "./model";

describe("symbol-intro batches", () => {
  it("deterministically pages 3-8 symbols into batches of 2-4", () => {
    for (let count = 3; count <= 8; count += 1) {
      const ids = Array.from({ length: count }, (_, index) => `symbol-${index}`);
      const first = createSymbolBatches(ids);
      const second = createSymbolBatches(ids);

      expect(first).toEqual(second);
      expect(first.flat()).toEqual(ids);
      expect(first.every((batch) => batch.length >= 2 && batch.length <= 4)).toBe(true);
    }
  });

  it("requires every current symbol to be activated before advancing", () => {
    const initial = createSymbolIntroState(["a", "b", "c", "d", "e"]);
    const one = activateSymbol(initial, "a");
    expect(advanceSymbolBatch(one)).toBe(one);

    const two = activateExample(one, "b");
    const three = activateSymbol(two, "c");
    const next = advanceSymbolBatch(three);
    expect(next).toMatchObject({ batchIndex: 1, helpVisible: false, phase: "learn" });
  });

  it("records help monotonically for the current batch", () => {
    const initial = createSymbolIntroState(["a", "b", "c"]);
    const shown = toggleSymbolHelp(initial);
    const hidden = toggleSymbolHelp(shown);

    expect(hidden.helpVisible).toBe(false);
    expect(hidden.exposures.every((exposure) => exposure.usedHelp)).toBe(true);
  });

  it("enters verification only after every batch is activated", () => {
    let state = createSymbolIntroState(["a", "b", "c"]);
    state = activateSymbol(state, "a");
    state = activateSymbol(state, "b");
    state = activateSymbol(state, "c");

    expect(advanceSymbolBatch(state).phase).toBe("verify");
  });
});

describe("symbol-intro verification", () => {
  function verifyingState() {
    let state = createSymbolIntroState(["a", "b", "c"]);
    state = activateSymbol(state, "a");
    state = activateSymbol(state, "b");
    state = activateSymbol(state, "c");
    return advanceSymbolBatch(state);
  }

  it("retains a wrong choice and records retry attempts", () => {
    const wrong = chooseSymbolAnswer(verifyingState(), 0, 1);
    expect(wrong).toMatchObject({
      verifyStep: 0,
      picked: 0,
      attempts: 1,
      feedback: "try-again",
      checks: [],
    });

    const correct = chooseSymbolAnswer(wrong, 1, 1);
    expect(correct.checks).toEqual([{ choiceIndex: 1, attempts: 2 }]);
  });

  it("advances only after a correct check and completes after the last one", () => {
    const wrong = chooseSymbolAnswer(verifyingState(), 0, 1);
    expect(advanceSymbolCheck(wrong, 1)).toBe(wrong);

    const correct = chooseSymbolAnswer(wrong, 1, 1);
    expect(advanceSymbolCheck(correct, 1).completed).toBe(true);
  });
});
