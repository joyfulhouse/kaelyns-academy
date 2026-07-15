import { describe, expect, it } from "vitest";
import { equalSegments, toggleSelectedSegment } from "./model";

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
