export interface FractionPoint {
  numerator: number;
  denominator: number;
}

export interface EqualSegment {
  index: number;
  start: FractionPoint;
  end: FractionPoint;
}

/** Exact rational geometry keeps correctness independent of rendered pixel widths. */
export function equalSegments(denominator: number): EqualSegment[] {
  return Array.from({ length: denominator }, (_, index) => ({
    index,
    start: { numerator: index, denominator },
    end: { numerator: index + 1, denominator },
  }));
}

export function toggleSelectedSegment(
  selected: readonly number[],
  index: number,
  denominator: number,
): number[] | readonly number[] {
  if (!Number.isInteger(index) || index < 0 || index >= denominator) return selected;
  if (selected.includes(index)) return selected.filter((candidate) => candidate !== index);
  return [...selected, index].sort((left, right) => left - right);
}
