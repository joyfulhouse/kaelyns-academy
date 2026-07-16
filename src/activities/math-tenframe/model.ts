import type { MathTenframeConfig } from "@/content/activity-configs";

export type CounterCell = "preset" | "added" | null;

export interface TenframeState {
  cells: CounterCell[];
  tenTokens: 0 | 1;
  placements: number[];
  removals: number[];
  tradeAtPlacement: number | null;
}

export function frameCapacity(frames: 1 | 2 | undefined): number {
  return (frames ?? 1) * 10;
}

export function createTenframeState(config: MathTenframeConfig): TenframeState {
  const capacity = frameCapacity(config.frames);
  const preset = config.mode === "represent" ? 0 : config.target;
  return {
    cells: Array.from({ length: capacity }, (_, index) =>
      index < preset ? "preset" : null,
    ),
    tenTokens: 0,
    placements: [],
    removals: [],
    tradeAtPlacement: null,
  };
}

function withoutIndex(indices: number[], index: number): number[] {
  return indices.filter((candidate) => candidate !== index);
}

function withCell(state: TenframeState, index: number, cell: CounterCell): CounterCell[] {
  return state.cells.map((current, cellIndex) => (cellIndex === index ? cell : current));
}

export function toggleCounter(
  config: MathTenframeConfig,
  state: TenframeState,
  index: number,
): TenframeState {
  const current = state.cells[index];
  if (current === undefined) return state;

  switch (config.mode) {
    case "represent":
    case "add": {
      if (current === "preset") return state;
      const removing = current === "added";
      return {
        ...state,
        cells: withCell(state, index, removing ? null : "added"),
        placements: removing
          ? withoutIndex(state.placements, index)
          : [...state.placements, index],
      };
    }
    case "subtract": {
      if (index >= config.target || current === "added") return state;
      const restoring = current === null;
      return {
        ...state,
        cells: withCell(state, index, restoring ? "preset" : null),
        removals: restoring
          ? withoutIndex(state.removals, index)
          : [...state.removals, index],
      };
    }
    case "make-ten": {
      const beforeTrade = state.tenTokens === 0;
      if ((beforeTrade && index >= 10) || (!beforeTrade && index < 10)) return state;
      if (current === "preset") return state;
      const removing = current === "added";
      return {
        ...state,
        cells: withCell(state, index, removing ? null : "added"),
        placements: removing
          ? withoutIndex(state.placements, index)
          : [...state.placements, index],
      };
    }
  }
}

export function occupiedCellIndices(state: TenframeState): number[] {
  return state.cells.flatMap((cell, index) => (cell === null ? [] : [index]));
}

export function representedTotal(state: TenframeState): number {
  return state.tenTokens * 10 + occupiedCellIndices(state).length;
}

export function canTradeFirstFrame(state: TenframeState): boolean {
  return state.tenTokens === 0 && state.cells.slice(0, 10).every((cell) => cell !== null);
}

export function tradeFirstFrame(state: TenframeState): TenframeState {
  if (!canTradeFirstFrame(state)) return state;
  return {
    ...state,
    cells: state.cells.map((cell, index) => (index < 10 ? null : cell)),
    tenTokens: 1,
    tradeAtPlacement: state.placements.length,
  };
}

export function undoTenframeState(
  history: TenframeState[],
  state: TenframeState,
): { state: TenframeState; history: TenframeState[] } {
  const previous = history.at(-1);
  if (previous === undefined) return { state, history };
  return { state: previous, history: history.slice(0, -1) };
}
