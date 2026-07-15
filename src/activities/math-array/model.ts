export interface DealState {
  pool: number[];
  groups: number[][];
}

export interface FactFamilyFact {
  left: number;
  operator: "×" | "÷";
  right: number;
  result: number;
}

export type FactFamily = readonly [
  FactFamilyFact,
  FactFamilyFact,
  FactFamilyFact,
  FactFamilyFact,
];

export function addCompleteRow(builtRows: number, targetRows: number): number {
  return Math.min(builtRows + 1, targetRows);
}

export function removeCompleteRow(builtRows: number): number {
  return Math.max(builtRows - 1, 0);
}

export function rowMajorTileIndices(rows: number, cols: number): number[] {
  return Array.from({ length: rows * cols }, (_, index) => index);
}

export function revealNextRow(revealedRows: number, targetRows: number): number {
  return Math.min(revealedRows + 1, targetRows);
}

export function skipCountSequence(revealedRows: number, cols: number): number[] {
  return Array.from({ length: revealedRows }, (_, index) => (index + 1) * cols);
}

export function resultChoices(expected: number): number[] {
  const choices = [expected, expected - 1, expected + 1, expected - 2, expected + 2].filter(
    (choice, index, all) =>
      choice >= 0 && choice <= 144 && all.indexOf(choice) === index,
  );
  const bounded = choices.slice(0, 3);
  const shift = expected % bounded.length;
  return [...bounded.slice(shift), ...bounded.slice(0, shift)];
}

export function createDealState(total: number, groupCount: number): DealState {
  return {
    pool: Array.from({ length: total }, (_, index) => index),
    groups: Array.from({ length: groupCount }, () => []),
  };
}

export function dealNextItem(state: DealState): DealState {
  const [nextItem, ...pool] = state.pool;
  if (nextItem === undefined || state.groups.length === 0) return state;

  const dealtCount = state.groups.reduce((total, group) => total + group.length, 0);
  const targetGroup = dealtCount % state.groups.length;
  return {
    pool,
    groups: state.groups.map((group, index) =>
      index === targetGroup ? [...group, nextItem] : group,
    ),
  };
}

export function isEqualDealComplete(state: DealState): boolean {
  if (state.pool.length > 0 || state.groups.length === 0) return false;
  const share = state.groups[0]?.length ?? 0;
  return share > 0 && state.groups.every((group) => group.length === share);
}

/** Derive the four related facts from the one authored sharing model. */
export function factFamilyFor(total: number, groups: number): FactFamily {
  const share = total / groups;
  return [
    { left: groups, operator: "×", right: share, result: total },
    { left: share, operator: "×", right: groups, result: total },
    { left: total, operator: "÷", right: groups, result: share },
    { left: total, operator: "÷", right: share, result: groups },
  ];
}

export function createAreaCells(rows: number, cols: number): boolean[] {
  return Array.from({ length: rows * cols }, () => false);
}

export function toggleAreaCell(cells: boolean[], index: number): boolean[] {
  if (index < 0 || index >= cells.length) return cells;
  return cells.map((filled, cellIndex) => (cellIndex === index ? !filled : filled));
}

export function filledAreaIndices(cells: boolean[]): number[] {
  return cells.flatMap((filled, index) => (filled ? [index] : []));
}

export function isAreaComplete(cells: boolean[]): boolean {
  return cells.length > 0 && cells.every(Boolean);
}
