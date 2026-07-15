const MAX_ATTEMPTS = 20;

export interface ListenMatchResult {
  choiceIndex: number;
  attempts: number;
  usedHelp: boolean;
}

export interface ListenMatchState {
  step: number;
  picked: number | null;
  attempts: number;
  helpVisible: boolean;
  usedHelp: boolean;
  feedback: "idle" | "try-again" | "correct";
  results: ListenMatchResult[];
  completed: boolean;
}

export function createListenMatchState(): ListenMatchState {
  return {
    step: 0,
    picked: null,
    attempts: 0,
    helpVisible: false,
    usedHelp: false,
    feedback: "idle",
    results: [],
    completed: false,
  };
}

export function toggleListenHelp(state: ListenMatchState): ListenMatchState {
  if (state.feedback === "correct" || state.completed) return state;
  const helpVisible = !state.helpVisible;
  return {
    ...state,
    helpVisible,
    usedHelp: state.usedHelp || helpVisible,
  };
}

export function chooseListenMatch(
  state: ListenMatchState,
  choiceIndex: number,
  answerIndex: number,
): ListenMatchState {
  if (state.feedback === "correct" || state.completed) return state;

  const attempts = Math.min(MAX_ATTEMPTS, state.attempts + 1);
  if (choiceIndex !== answerIndex) {
    return {
      ...state,
      picked: choiceIndex,
      attempts,
      feedback: "try-again",
    };
  }

  return {
    ...state,
    picked: choiceIndex,
    attempts,
    feedback: "correct",
    results: [
      ...state.results,
      { choiceIndex, attempts, usedHelp: state.usedHelp },
    ],
  };
}

export function advanceListenMatch(
  state: ListenMatchState,
  itemCount: number,
): ListenMatchState {
  if (state.feedback !== "correct") return state;
  if (state.step + 1 >= itemCount) return { ...state, completed: true };
  return {
    ...state,
    step: state.step + 1,
    picked: null,
    attempts: 0,
    helpVisible: false,
    usedHelp: false,
    feedback: "idle",
  };
}
