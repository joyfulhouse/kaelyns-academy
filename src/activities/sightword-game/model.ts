const MAX_ATTEMPTS = 20;

export interface SightwordRoundResult {
  roundIndex: number;
  choiceIndex: number;
  attempts: number;
  usedHelp: boolean;
}

export interface SightwordRoundState {
  attempts: number;
  helpVisible: boolean;
  usedHelp: boolean;
  wrongChoiceIndexes: number[];
  feedback: "idle" | "try-again";
}

export interface SightwordChoiceTransition {
  state: SightwordRoundState;
  result: SightwordRoundResult | null;
}

export function createSightwordRoundState(): SightwordRoundState {
  return {
    attempts: 1,
    helpVisible: false,
    usedHelp: false,
    wrongChoiceIndexes: [],
    feedback: "idle",
  };
}

/** Revealing the target is durable support evidence, even if it is later hidden by a rerender. */
export function revealSightword(state: SightwordRoundState): SightwordRoundState {
  if (state.helpVisible) return state;
  return { ...state, helpVisible: true, usedHelp: true };
}

export function chooseSightword(
  state: SightwordRoundState,
  choiceIndex: number,
  correct: boolean,
  roundIndex: number,
): SightwordChoiceTransition {
  if (correct) {
    return {
      state,
      result: {
        roundIndex,
        choiceIndex,
        attempts: state.attempts,
        usedHelp: state.usedHelp,
      },
    };
  }

  return {
    state: {
      ...state,
      attempts: Math.min(MAX_ATTEMPTS, state.attempts + 1),
      wrongChoiceIndexes: state.wrongChoiceIndexes.includes(choiceIndex)
        ? state.wrongChoiceIndexes
        : [...state.wrongChoiceIndexes, choiceIndex],
      feedback: "try-again",
    },
    result: null,
  };
}
