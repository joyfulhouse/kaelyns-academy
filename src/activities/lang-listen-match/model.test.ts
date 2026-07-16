import { describe, expect, it } from "vitest";
import {
  advanceListenMatch,
  chooseListenMatch,
  createListenMatchState,
  toggleListenHelp,
} from "./model";

describe("listen-match round state", () => {
  it("retains a wrong choice and stays on the same prompt", () => {
    const state = chooseListenMatch(createListenMatchState(), 1, 2);

    expect(state).toMatchObject({
      step: 0,
      picked: 1,
      attempts: 1,
      feedback: "try-again",
      results: [],
    });
  });

  it("records first-try success and waits for an explicit advance", () => {
    const state = chooseListenMatch(createListenMatchState(), 2, 2);

    expect(state).toMatchObject({
      step: 0,
      picked: 2,
      attempts: 1,
      feedback: "correct",
      results: [{ choiceIndex: 2, attempts: 1, usedHelp: false }],
    });
  });

  it("records retries and support without changing correctness", () => {
    const supported = toggleListenHelp(createListenMatchState());
    const wrong = chooseListenMatch(supported, 0, 1);
    const correct = chooseListenMatch(wrong, 1, 1);

    expect(correct.results).toEqual([{ choiceIndex: 1, attempts: 2, usedHelp: true }]);
  });

  it("keeps support recorded after the learner hides the labels", () => {
    const shown = toggleListenHelp(createListenMatchState());
    const hidden = toggleListenHelp(shown);
    const correct = chooseListenMatch(hidden, 0, 0);

    expect(hidden).toMatchObject({ helpVisible: false, usedHelp: true });
    expect(correct.results[0]?.usedHelp).toBe(true);
  });

  it("advances only after a correct choice and resets per-item state", () => {
    const wrong = chooseListenMatch(createListenMatchState(), 0, 1);
    expect(advanceListenMatch(wrong, 2)).toBe(wrong);

    const correct = chooseListenMatch(wrong, 1, 1);
    expect(advanceListenMatch(correct, 2)).toMatchObject({
      step: 1,
      picked: null,
      attempts: 0,
      helpVisible: false,
      usedHelp: false,
      feedback: "idle",
      completed: false,
    });
  });

  it("marks the interaction complete after the last correct round", () => {
    const correct = chooseListenMatch(createListenMatchState(), 0, 0);
    expect(advanceListenMatch(correct, 1).completed).toBe(true);
  });
});
