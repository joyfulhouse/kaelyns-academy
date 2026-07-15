import type { SortCategoriesConfig } from "@/content/activity-configs";
import { shuffleNonIdentity, stableSeed } from "../_shared/shuffle";

export interface SortAssignment {
  itemIndex: number;
  binId: string;
}

/** Full authored identity, including indices and answer ids, seeds the tray. */
export function sortSeed(config: SortCategoriesConfig): number {
  return stableSeed([
    "sort-categories",
    config.instruction,
    ...config.bins.flatMap((bin, binIndex) => [binIndex, bin.id, bin.label, bin.emoji]),
    ...config.items.flatMap((item, itemIndex) => [
      itemIndex,
      item.label,
      item.emoji,
      item.binId,
    ]),
  ]);
}

export function initialItemOrder(config: SortCategoriesConfig): number[] {
  return shuffleNonIdentity(
    config.items.map((_item, itemIndex) => itemIndex),
    sortSeed(config),
  );
}

export function placeItem(
  assignments: readonly SortAssignment[],
  itemIndex: number,
  binId: string,
  config: SortCategoriesConfig,
): SortAssignment[] {
  if (
    !Number.isInteger(itemIndex) ||
    itemIndex < 0 ||
    itemIndex >= config.items.length ||
    !config.bins.some((bin) => bin.id === binId)
  ) {
    return assignments as SortAssignment[];
  }

  return [
    ...assignments.filter((assignment) => assignment.itemIndex !== itemIndex),
    { itemIndex, binId },
  ].sort((left, right) => left.itemIndex - right.itemIndex);
}

export function unplaceItem(
  assignments: readonly SortAssignment[],
  itemIndex: number,
): SortAssignment[] {
  return assignments.filter((assignment) => assignment.itemIndex !== itemIndex);
}

export function assignedBin(
  assignments: readonly SortAssignment[],
  itemIndex: number,
): string | null {
  return assignments.find((assignment) => assignment.itemIndex === itemIndex)?.binId ?? null;
}

export function assignmentsComplete(
  config: SortCategoriesConfig,
  assignments: readonly SortAssignment[],
): boolean {
  if (assignments.length !== config.items.length) return false;
  const itemIndices = new Set<number>();
  for (const assignment of assignments) {
    if (
      !Number.isInteger(assignment.itemIndex) ||
      assignment.itemIndex < 0 ||
      assignment.itemIndex >= config.items.length ||
      itemIndices.has(assignment.itemIndex) ||
      !config.bins.some((bin) => bin.id === assignment.binId)
    ) {
      return false;
    }
    itemIndices.add(assignment.itemIndex);
  }
  return itemIndices.size === config.items.length;
}
