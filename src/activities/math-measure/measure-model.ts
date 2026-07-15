export type MeasureAttribute = "length" | "height" | "weight";
export type ComparisonQuestion = "most" | "least";

export interface SizedItem {
  size: number;
}

export type BalanceTilt = "left" | "level" | "right";

/** Scale a relative authored amount from the shared zero baseline. */
export function scaledExtent(size: number, largestSize: number, maximumExtent: number): number {
  if (largestSize <= 0 || maximumExtent <= 0) return 0;
  const boundedSize = Math.min(Math.max(size, 0), largestSize);
  return (boundedSize / largestSize) * maximumExtent;
}

function valueForAttribute(attribute: MeasureAttribute, item: SizedItem): number {
  switch (attribute) {
    case "length":
    case "height":
    case "weight":
      return item.size;
  }
}

/** Derive the unique requested extreme; ambiguous authored comparisons fail closed. */
export function deriveComparisonIndex(
  attribute: MeasureAttribute,
  question: ComparisonQuestion,
  items: SizedItem[],
): number | null {
  if (items.length === 0) return null;
  const values = items.map((item) => valueForAttribute(attribute, item));
  const extreme = question === "most" ? Math.max(...values) : Math.min(...values);
  const matching = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === extreme);
  return matching.length === 1 ? matching[0].index : null;
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
