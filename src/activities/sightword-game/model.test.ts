import { describe, expect, it } from "vitest";
import {
  chooseSightword,
  createSightwordRoundState,
  revealSightword,
} from "./model";

describe("sight-word round model", () => {
  it("records revealed help in the correct response even after a retry", () => {
    const initial = createSightwordRoundState();
    const helped = revealSightword(initial);
    const retried = chooseSightword(helped, 0, false, 0);
    const correct = chooseSightword(retried.state, 1, true, 0);

    expect(helped).toMatchObject({ helpVisible: true, usedHelp: true });
    expect(retried.result).toBeNull();
    expect(correct.result).toEqual({
      roundIndex: 0,
      choiceIndex: 1,
      attempts: 2,
      usedHelp: true,
    });
  });

  it("starts each round hidden and caps repeated wrong attempts", () => {
    let state = createSightwordRoundState();
    for (let index = 0; index < 30; index += 1) {
      state = chooseSightword(state, 0, false, 0).state;
    }

    expect(createSightwordRoundState()).toMatchObject({
      attempts: 1,
      helpVisible: false,
      usedHelp: false,
      wrongChoiceIndexes: [],
    });
    expect(state.attempts).toBe(20);
    expect(state.wrongChoiceIndexes).toEqual([0]);
  });
});
