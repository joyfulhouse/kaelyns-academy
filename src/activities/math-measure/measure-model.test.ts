import { describe, expect, it } from "vitest";
import {
  analyzeUnitPlacements,
  balanceAngle,
  balanceTiltDirection,
  comparisonDescription,
  deriveComparisonIndex,
  MEASUREMENT_UNIT_PX,
  measurementExtent,
  reduceUnitPlacements,
  rotatePoint,
  scaledExtent,
  snapToUnitSlot,
} from "./measure-model";

describe("proportional comparison geometry", () => {
  it("scales length and height from the same zero baseline", () => {
    expect(scaledExtent(2, 4, 160)).toBe(80);
    expect(scaledExtent(4, 4, 160)).toBe(160);
    expect(scaledExtent(0, 4, 160)).toBe(0);
  });

  it("derives a unique requested extreme for every attribute", () => {
    const items = [{ size: 3 }, { size: 1 }, { size: 5 }];
    expect(deriveComparisonIndex("length", "most", items)).toBe(2);
    expect(deriveComparisonIndex("height", "least", items)).toBe(1);
    expect(deriveComparisonIndex("weight", "most", items)).toBe(2);
  });

  it("returns null when the requested extreme is tied", () => {
    expect(deriveComparisonIndex("length", "most", [{ size: 4 }, { size: 4 }])).toBeNull();
  });
});

describe("balance geometry", () => {
  it("tilts down toward the heavier side", () => {
    expect(balanceTiltDirection(4, 1)).toBe("left");
    expect(balanceAngle(4, 1)).toBe(-8);
    expect(balanceTiltDirection(1, 4)).toBe("right");
    expect(balanceAngle(1, 4)).toBe(8);
    expect(balanceTiltDirection(2, 2)).toBe("level");
    expect(balanceAngle(2, 2)).toBe(0);
  });

  it("locates tilted beam attachments without rotating the hanging pans", () => {
    const left = rotatePoint({ x: 135, y: 88 }, { x: 280, y: 88 }, 8);
    const right = rotatePoint({ x: 425, y: 88 }, { x: 280, y: 88 }, 8);

    expect(left.y).toBeLessThan(88);
    expect(right.y).toBeGreaterThan(88);
    expect(left.x).toBeCloseTo(136.41, 2);
    expect(right.x).toBeCloseTo(423.59, 2);
  });
});

describe("nonvisual comparison descriptions", () => {
  it("names every relative length and height from the shared origin", () => {
    const items = [
      { label: "pencil", size: 3 },
      { label: "crayon", size: 2 },
      { label: "marker", size: 4 },
    ];

    expect(comparisonDescription("length", items)).toBe(
      "Length comparison from one shared start line. pencil extends 3 relative units; crayon extends 2 relative units; marker extends 4 relative units.",
    );
    expect(comparisonDescription("height", items)).toBe(
      "Height comparison from one shared baseline. pencil stands 3 relative units tall; crayon stands 2 relative units tall; marker stands 4 relative units tall.",
    );
  });

  it("names the lower heavier and higher lighter balance pans", () => {
    expect(
      comparisonDescription("weight", [
        { label: "feather", size: 1 },
        { label: "watermelon", size: 4 },
      ]),
    ).toBe(
      "Balance comparison. watermelon pan is lower and watermelon is heavier; feather pan is higher and feather is lighter.",
    );
  });
});

describe("placed units", () => {
  it("uses one shared span for the target and every placed unit", () => {
    for (let count = 1; count <= 12; count += 1) {
      expect(measurementExtent(count)).toBe(count * MEASUREMENT_UNIT_PX);
    }
    expect(measurementExtent(5) - measurementExtent(4)).toBe(MEASUREMENT_UNIT_PX);
  });

  it("places, moves, and removes stable units through positional actions", () => {
    const one = reduceUnitPlacements([], {
      type: "place",
      placement: { id: "unit-1", slot: 0 },
    });
    const overlapped = reduceUnitPlacements(one, {
      type: "place",
      placement: { id: "unit-2", slot: 0 },
    });
    const moved = reduceUnitPlacements(overlapped, { type: "move", id: "unit-2", slot: 1 });

    expect(overlapped).toEqual([
      { id: "unit-1", slot: 0 },
      { id: "unit-2", slot: 0 },
    ]);
    expect(moved).toEqual([
      { id: "unit-1", slot: 0 },
      { id: "unit-2", slot: 1 },
    ]);
    expect(reduceUnitPlacements(moved, { type: "remove", id: "unit-1" })).toEqual([
      { id: "unit-2", slot: 1 },
    ]);
    expect(reduceUnitPlacements(moved, { type: "clear" })).toEqual([]);
  });

  it("ignores duplicate IDs, out-of-range slots, and placements past capacity", () => {
    const full = Array.from({ length: 12 }, (_, slot) => ({ id: `unit-${slot}`, slot }));

    expect(
      reduceUnitPlacements(full, {
        type: "place",
        placement: { id: "unit-new", slot: 0 },
      }),
    ).toBe(full);
    expect(
      reduceUnitPlacements(full, {
        type: "place",
        placement: { id: "unit-1", slot: 1 },
      }),
    ).toBe(full);
    expect(reduceUnitPlacements(full, { type: "move", id: "unit-1", slot: 12 })).toBe(full);
  });

  it("derives a count only from one contiguous unit per slot at the start line", () => {
    expect(
      analyzeUnitPlacements(
        [
          { id: "unit-1", slot: 0 },
          { id: "unit-2", slot: 1 },
          { id: "unit-3", slot: 2 },
        ],
        3,
      ),
    ).toEqual({ validCount: 3, issue: "none" });
    expect(
      analyzeUnitPlacements(
        [
          { id: "unit-1", slot: 1 },
          { id: "unit-2", slot: 2 },
        ],
        3,
      ),
    ).toEqual({ validCount: 0, issue: "alignment" });
    expect(
      analyzeUnitPlacements(
        [
          { id: "unit-1", slot: 0 },
          { id: "unit-2", slot: 2 },
        ],
        3,
      ),
    ).toEqual({ validCount: 1, issue: "gap" });
    expect(
      analyzeUnitPlacements(
        [
          { id: "unit-1", slot: 0 },
          { id: "unit-2", slot: 1 },
          { id: "unit-3", slot: 1 },
        ],
        3,
      ),
    ).toEqual({ validCount: 1, issue: "overlap" });
    expect(
      analyzeUnitPlacements(
        [
          { id: "unit-1", slot: 0 },
          { id: "unit-2", slot: 1 },
          { id: "unit-3", slot: 2 },
          { id: "unit-4", slot: 3 },
        ],
        3,
      ),
    ).toEqual({ validCount: 3, issue: "past-target" });
    expect(
      analyzeUnitPlacements(
        [
          { id: "unit-1", slot: 0 },
          { id: "unit-2", slot: 1 },
        ],
        3,
      ),
    ).toEqual({ validCount: 2, issue: "short" });
  });

  it("snaps a pointer coordinate to one of twelve discrete slots", () => {
    expect(snapToUnitSlot(100, 100, 480, 12)).toBe(0);
    expect(snapToUnitSlot(139, 100, 480, 12)).toBe(0);
    expect(snapToUnitSlot(140, 100, 480, 12)).toBe(1);
    expect(snapToUnitSlot(579, 100, 480, 12)).toBe(11);
    expect(snapToUnitSlot(99, 100, 480, 12)).toBeNull();
    expect(snapToUnitSlot(580, 100, 480, 12)).toBeNull();
  });
});
