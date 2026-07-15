import type {
  MeasureAttribute,
  SizedItem,
} from "@/content/activity-configs/math-measure-derivation";

export {
  deriveComparisonIndex,
  type ComparisonQuestion,
  type MeasureAttribute,
  type SizedItem,
} from "@/content/activity-configs/math-measure-derivation";

export type BalanceTilt = "left" | "level" | "right";

interface LabeledSizedItem extends SizedItem {
  label: string;
}

export interface Point {
  x: number;
  y: number;
}

/** One authored measurement unit always occupies this span in the shared SVG workspace. */
export const MEASUREMENT_UNIT_PX = 48;

export function measurementExtent(unitCount: number): number {
  return Math.max(0, Math.floor(unitCount)) * MEASUREMENT_UNIT_PX;
}

/** Scale a relative authored amount from the shared zero baseline. */
export function scaledExtent(size: number, largestSize: number, maximumExtent: number): number {
  if (largestSize <= 0 || maximumExtent <= 0) return 0;
  const boundedSize = Math.min(Math.max(size, 0), largestSize);
  return (boundedSize / largestSize) * maximumExtent;
}

export function balanceTiltDirection(leftWeight: number, rightWeight: number): BalanceTilt {
  if (leftWeight > rightWeight) return "left";
  if (rightWeight > leftWeight) return "right";
  return "level";
}

/** SVG rotates clockwise, so positive degrees lower the right pan. */
export function balanceAngle(leftWeight: number, rightWeight: number): -8 | 0 | 8 {
  const direction = balanceTiltDirection(leftWeight, rightWeight);
  if (direction === "left") return -8;
  if (direction === "right") return 8;
  return 0;
}

/** Describe the same relative measurement facts conveyed by the comparison graphic. */
export function comparisonDescription(
  attribute: MeasureAttribute,
  items: readonly LabeledSizedItem[],
): string {
  if (attribute === "length") {
    const extents = items
      .map((item) => `${item.label} extends ${item.size} relative units`)
      .join("; ");
    return `Length comparison from one shared start line. ${extents}.`;
  }

  if (attribute === "height") {
    const extents = items
      .map((item) => `${item.label} stands ${item.size} relative units tall`)
      .join("; ");
    return `Height comparison from one shared baseline. ${extents}.`;
  }

  const [left, right] = items;
  if (!left || !right) return "Balance comparison.";
  const tilt = balanceTiltDirection(left.size, right.size);
  if (tilt === "level") {
    return `Balance comparison. ${left.label} and ${right.label} pans are level because the objects have equal relative weight.`;
  }
  const lower = tilt === "left" ? left : right;
  const higher = tilt === "left" ? right : left;
  return `Balance comparison. ${lower.label} pan is lower and ${lower.label} is heavier; ${higher.label} pan is higher and ${higher.label} is lighter.`;
}

/** Locate a beam attachment after tilt so its hanging pan can remain upright. */
export function rotatePoint(point: Point, pivot: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const offsetX = point.x - pivot.x;
  const offsetY = point.y - pivot.y;
  return {
    x: pivot.x + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
    y: pivot.y + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
  };
}

export function addPlacedUnit(unitIds: string[], unitId: string, capacity: number): string[] {
  if (unitIds.length >= capacity || unitIds.includes(unitId)) return unitIds;
  return [...unitIds, unitId];
}

export function removePlacedUnit(unitIds: string[], unitId: string): string[] {
  const index = unitIds.indexOf(unitId);
  if (index === -1) return unitIds;
  return [...unitIds.slice(0, index), ...unitIds.slice(index + 1)];
}

export function placedUnitCount(unitIds: string[]): number {
  return unitIds.length;
}
