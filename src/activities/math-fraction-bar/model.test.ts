import { describe, expect, it } from "vitest";
import {
  equalSegments,
  partitionCandidates,
  partitionDescription,
  toggleSelectedSegment,
} from "./model";

describe("math-fraction-bar equal segment geometry", () => {
  it.each([2, 3, 4])("covers one whole with %i equal rational segments", (denominator) => {
    const segments = equalSegments(denominator);

    expect(segments).toHaveLength(denominator);
    expect(segments).toEqual(
      Array.from({ length: denominator }, (_, index) => ({
        index,
        start: { numerator: index, denominator },
        end: { numerator: index + 1, denominator },
      })),
    );
  });
});

describe("math-fraction-bar segment selection", () => {
  it("selects and deselects individual segments in stable order", () => {
    const selected = toggleSelectedSegment([], 2, 4);
    const withFirst = toggleSelectedSegment(selected, 0, 4);

    expect(selected).toEqual([2]);
    expect(withFirst).toEqual([0, 2]);
    expect(toggleSelectedSegment(withFirst, 2, 4)).toEqual([0]);
  });

  it("ignores indices outside the configured bar", () => {
    const selected = [1];

    expect(toggleSelectedSegment(selected, -1, 3)).toBe(selected);
    expect(toggleSelectedSegment(selected, 3, 3)).toBe(selected);
  });
});

describe("math-fraction-bar partition candidates", () => {
  it.each([2, 3, 4])(
    "offers one equal and two unequal %i-part bars without changing the target part count",
    (denominator) => {
      const candidates = partitionCandidates(denominator);

      expect(candidates).toHaveLength(3);
      expect(candidates.every((candidate) => candidate.partWidths.length === denominator)).toBe(
        true,
      );
      expect(candidates.filter((candidate) => candidate.id === "equal")).toHaveLength(1);
      expect(
        candidates.filter(
          (candidate) => new Set(candidate.partWidths).size === 1,
        ),
      ).toHaveLength(1);
      expect(
        candidates.filter(
          (candidate) => new Set(candidate.partWidths).size > 1,
        ),
      ).toHaveLength(2);
    },
  );

  it("describes relative part widths without labeling the correct choice", () => {
    const [candidate] = partitionCandidates(4);

    expect(partitionDescription(candidate, 1)).toBe(
      "Choice 1. Four parts with relative widths 1, 3, 2, 2.",
    );
    expect(partitionDescription(candidate, 1).toLowerCase()).not.toContain("equal");
    expect(partitionDescription(candidate, 1).toLowerCase()).not.toContain("unequal");
  });
});
