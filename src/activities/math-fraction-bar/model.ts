export interface FractionPoint {
  numerator: number;
  denominator: number;
}

export interface EqualSegment {
  index: number;
  start: FractionPoint;
  end: FractionPoint;
}

export const PARTITION_CANDIDATE_IDS = ["equal", "narrow-first", "wide-first"] as const;
export type PartitionCandidateId = (typeof PARTITION_CANDIDATE_IDS)[number];

export interface PartitionCandidate {
  id: PartitionCandidateId;
  /** Small whole-number ratios render truthful relative widths without pixel rounding. */
  partWidths: readonly number[];
}

const CANDIDATE_LAYOUTS: Record<2 | 3 | 4, readonly PartitionCandidate[]> = {
  2: [
    { id: "narrow-first", partWidths: [1, 2] },
    { id: "equal", partWidths: [1, 1] },
    { id: "wide-first", partWidths: [2, 1] },
  ],
  3: [
    { id: "wide-first", partWidths: [3, 1, 2] },
    { id: "narrow-first", partWidths: [1, 2, 3] },
    { id: "equal", partWidths: [2, 2, 2] },
  ],
  4: [
    { id: "narrow-first", partWidths: [1, 3, 2, 2] },
    { id: "equal", partWidths: [2, 2, 2, 2] },
    { id: "wide-first", partWidths: [3, 1, 2, 2] },
  ],
};

export function partitionCandidates(denominator: number): PartitionCandidate[] {
  if (denominator !== 2 && denominator !== 3 && denominator !== 4) return [];
  return CANDIDATE_LAYOUTS[denominator].map((candidate) => ({
    ...candidate,
    partWidths: [...candidate.partWidths],
  }));
}

export function partitionDescription(candidate: PartitionCandidate, choiceNumber: number): string {
  const partName = ["", "", "Two", "Three", "Four"][candidate.partWidths.length] ?? "Several";
  return `Choice ${choiceNumber}. ${partName} parts with relative widths ${candidate.partWidths.join(", ")}.`;
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
