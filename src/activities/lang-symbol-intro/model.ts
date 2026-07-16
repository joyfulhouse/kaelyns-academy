const MAX_ATTEMPTS = 20;

export interface SymbolExposure {
  symbolId: string;
  activated: boolean;
  heardExample: boolean;
  usedHelp: boolean;
}

export interface SymbolCheck {
  choiceIndex: number;
  attempts: number;
}

export interface SymbolIntroState {
  phase: "learn" | "verify";
  batches: string[][];
  batchIndex: number;
  exposures: SymbolExposure[];
  helpVisible: boolean;
  verifyStep: number;
  picked: number | null;
  attempts: number;
  feedback: "idle" | "try-again" | "correct";
  checks: SymbolCheck[];
  completed: boolean;
}

/** Preserve authored order while keeping every guided page between two and four cards. */
export function createSymbolBatches(symbolIds: string[]): string[][] {
  if (symbolIds.length <= 4) return [symbolIds.slice()];
  const firstSize = Math.ceil(symbolIds.length / 2);
  return [symbolIds.slice(0, firstSize), symbolIds.slice(firstSize)];
}

export function createSymbolIntroState(symbolIds: string[]): SymbolIntroState {
  return {
    phase: "learn",
    batches: createSymbolBatches(symbolIds),
    batchIndex: 0,
    exposures: symbolIds.map((symbolId) => ({
      symbolId,
      activated: false,
      heardExample: false,
      usedHelp: false,
    })),
    helpVisible: false,
    verifyStep: 0,
    picked: null,
    attempts: 0,
    feedback: "idle",
    checks: [],
    completed: false,
  };
}

function isInCurrentBatch(state: SymbolIntroState, symbolId: string): boolean {
  return state.batches[state.batchIndex]?.includes(symbolId) ?? false;
}

export function activateSymbol(state: SymbolIntroState, symbolId: string): SymbolIntroState {
  if (state.phase !== "learn" || !isInCurrentBatch(state, symbolId)) return state;
  return {
    ...state,
    exposures: state.exposures.map((exposure) =>
      exposure.symbolId === symbolId ? { ...exposure, activated: true } : exposure,
    ),
  };
}

export function activateExample(state: SymbolIntroState, symbolId: string): SymbolIntroState {
  if (state.phase !== "learn" || !isInCurrentBatch(state, symbolId)) return state;
  return {
    ...state,
    exposures: state.exposures.map((exposure) =>
      exposure.symbolId === symbolId
        ? { ...exposure, activated: true, heardExample: true }
        : exposure,
    ),
  };
}

export function toggleSymbolHelp(state: SymbolIntroState): SymbolIntroState {
  if (state.phase !== "learn") return state;
  const helpVisible = !state.helpVisible;
  if (!helpVisible) return { ...state, helpVisible };
  const current = new Set(state.batches[state.batchIndex] ?? []);
  return {
    ...state,
    helpVisible,
    exposures: state.exposures.map((exposure) =>
      current.has(exposure.symbolId) ? { ...exposure, usedHelp: true } : exposure,
    ),
  };
}

export function currentBatchReady(state: SymbolIntroState): boolean {
  const current = state.batches[state.batchIndex] ?? [];
  return (
    current.length > 0 &&
    current.every((symbolId) =>
      state.exposures.some((exposure) => exposure.symbolId === symbolId && exposure.activated),
    )
  );
}

export function advanceSymbolBatch(state: SymbolIntroState): SymbolIntroState {
  if (state.phase !== "learn" || !currentBatchReady(state)) return state;
  if (state.batchIndex + 1 < state.batches.length) {
    return {
      ...state,
      batchIndex: state.batchIndex + 1,
      helpVisible: false,
    };
  }
  return {
    ...state,
    phase: "verify",
    helpVisible: false,
  };
}

export function chooseSymbolAnswer(
  state: SymbolIntroState,
  choiceIndex: number,
  answerIndex: number,
): SymbolIntroState {
  if (state.phase !== "verify" || state.feedback === "correct" || state.completed) return state;
  const attempts = Math.min(MAX_ATTEMPTS, state.attempts + 1);
  if (choiceIndex !== answerIndex) {
    return { ...state, picked: choiceIndex, attempts, feedback: "try-again" };
  }
  return {
    ...state,
    picked: choiceIndex,
    attempts,
    feedback: "correct",
    checks: [...state.checks, { choiceIndex, attempts }],
  };
}

export function advanceSymbolCheck(
  state: SymbolIntroState,
  checkCount: number,
): SymbolIntroState {
  if (state.phase !== "verify" || state.feedback !== "correct") return state;
  if (state.verifyStep + 1 >= checkCount) return { ...state, completed: true };
  return {
    ...state,
    verifyStep: state.verifyStep + 1,
    picked: null,
    attempts: 0,
    feedback: "idle",
  };
}
