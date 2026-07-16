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
  const indices = config.items.map((_item, itemIndex) => itemIndex);
  const seed = sortSeed(config);
  let best = shuffleNonIdentity(indices, seed);
  let bestRun = longestCategoryRun(best, config);
  const targetRun = minimumPossibleCategoryRun(config);

  // A plain shuffle can accidentally preserve authored answer blocks. Try a
  // small deterministic seed family and keep the most dispersed permutation.
  // Eight items is the schema maximum, so this remains tiny and synchronous.
  for (let attempt = 1; attempt <= 64 && bestRun > targetRun; attempt += 1) {
    const candidate = shuffleNonIdentity(indices, stableSeed([seed, attempt]));
    const candidateRun = longestCategoryRun(candidate, config);
    if (candidateRun < bestRun) {
      best = candidate;
      bestRun = candidateRun;
    }
  }
  return best;
}

function longestCategoryRun(order: readonly number[], config: SortCategoriesConfig): number {
  let longest = 0;
  let current = 0;
  let previousBin: string | null = null;
  for (const itemIndex of order) {
    const binId = config.items[itemIndex]?.binId ?? null;
    current = binId === previousBin ? current + 1 : 1;
    longest = Math.max(longest, current);
    previousBin = binId;
  }
  return longest;
}

function minimumPossibleCategoryRun(config: SortCategoriesConfig): number {
  const counts = new Map<string, number>();
  for (const item of config.items) counts.set(item.binId, (counts.get(item.binId) ?? 0) + 1);
  const largest = Math.max(0, ...counts.values());
  const others = config.items.length - largest;
  return largest === 0 ? 0 : Math.ceil(largest / (others + 1));
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
