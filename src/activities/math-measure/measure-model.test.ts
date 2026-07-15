import { describe, expect, it } from "vitest";
import {
  addPlacedUnit,
  balanceAngle,
  balanceTiltDirection,
  deriveComparisonIndex,
  MEASUREMENT_UNIT_PX,
  measurementExtent,
  placedUnitCount,
  removePlacedUnit,
  rotatePoint,
  scaledExtent,
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

describe("placed units", () => {
  it("uses one shared span for the target and every placed unit", () => {
    for (let count = 1; count <= 12; count += 1) {
      expect(measurementExtent(count)).toBe(count * MEASUREMENT_UNIT_PX);
    }
    expect(measurementExtent(5) - measurementExtent(4)).toBe(MEASUREMENT_UNIT_PX);
  });

  it("adds and removes individual stable unit IDs up to capacity", () => {
    const one = addPlacedUnit([], "unit-1", 2);
    const two = addPlacedUnit(one, "unit-2", 2);
    expect(two).toEqual(["unit-1", "unit-2"]);
    expect(addPlacedUnit(two, "unit-3", 2)).toBe(two);
    expect(addPlacedUnit(two, "unit-2", 3)).toBe(two);
    expect(removePlacedUnit(two, "unit-1")).toEqual(["unit-2"]);
  });

  it("counts the units that were actually placed", () => {
    expect(placedUnitCount(["unit-1", "unit-2", "unit-3"])).toBe(3);
  });
});
