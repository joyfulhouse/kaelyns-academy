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
export const MAX_MEASUREMENT_UNITS = 12;

export interface UnitPlacement {
  id: string;
  slot: number;
}

export type UnitPlacementAction =
  | { type: "place"; placement: UnitPlacement }
  | { type: "move"; id: string; slot: number }
  | { type: "remove"; id: string }
  | { type: "clear" };

export type UnitPlacementIssue =
  | "none"
  | "alignment"
  | "gap"
  | "overlap"
  | "past-target"
  | "short";

/** Record an intentional align action once; invalid and repeated actions are no-ops. */
export function alignComparisonItem(
  alignedIndices: number[],
  index: number,
  itemCount: number,
): number[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= itemCount ||
    alignedIndices.includes(index)
  ) {
    return alignedIndices;
  }
  return [...alignedIndices, index];
}

export function allComparisonItemsAligned(
  alignedIndices: readonly number[],
  itemCount: number,
): boolean {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return false;
  return new Set(alignedIndices.filter((index) => index >= 0 && index < itemCount)).size === itemCount;
}

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
    return `Balance comparison. ${left.label} and ${right.label} pans are level.`;
  }
  const lower = tilt === "left" ? left : right;
  const higher = tilt === "left" ? right : left;
  return `Balance comparison. ${lower.label} pan is lower; ${higher.label} pan is higher.`;
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

function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < MAX_MEASUREMENT_UNITS;
}

export function reduceUnitPlacements(
  placements: UnitPlacement[],
  action: UnitPlacementAction,
): UnitPlacement[] {
  if (action.type === "clear") return placements.length === 0 ? placements : [];

  if (action.type === "place") {
    if (
      placements.length >= MAX_MEASUREMENT_UNITS ||
      !isValidSlot(action.placement.slot) ||
      placements.some((placement) => placement.id === action.placement.id)
    ) {
      return placements;
    }
    return [...placements, action.placement];
  }

  const index = placements.findIndex((placement) => placement.id === action.id);
  if (index === -1) return placements;

  if (action.type === "remove") {
    return [...placements.slice(0, index), ...placements.slice(index + 1)];
  }

  if (!isValidSlot(action.slot) || placements[index]?.slot === action.slot) return placements;
  return placements.map((placement, placementIndex) =>
    placementIndex === index ? { ...placement, slot: action.slot } : placement,
  );
}

export function analyzeUnitPlacements(
  placements: readonly UnitPlacement[],
  targetLength: number,
): { validCount: number; issue: UnitPlacementIssue } {
  const slotCounts = Array.from({ length: MAX_MEASUREMENT_UNITS }, () => 0);
  for (const placement of placements) {
    if (isValidSlot(placement.slot)) slotCounts[placement.slot] += 1;
  }

  let validCount = 0;
  while (validCount < targetLength && slotCounts[validCount] === 1) validCount += 1;

  if (slotCounts.some((count) => count > 1)) return { validCount, issue: "overlap" };
  if (placements.length > 0 && slotCounts[0] === 0) return { validCount: 0, issue: "alignment" };
  if (slotCounts.slice(targetLength).some((count) => count > 0)) {
    return { validCount, issue: "past-target" };
  }
  if (validCount < targetLength && slotCounts.slice(validCount + 1, targetLength).some(Boolean)) {
    return { validCount, issue: "gap" };
  }
  if (validCount < targetLength) return { validCount, issue: "short" };
  return { validCount, issue: "none" };
}

export function snapToUnitSlot(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  slotCount = MAX_MEASUREMENT_UNITS,
): number | null {
  if (trackWidth <= 0 || slotCount <= 0 || !Number.isInteger(slotCount)) return null;
  const offset = clientX - trackLeft;
  if (offset < 0 || offset >= trackWidth) return null;
  return Math.floor(offset / (trackWidth / slotCount));
}
