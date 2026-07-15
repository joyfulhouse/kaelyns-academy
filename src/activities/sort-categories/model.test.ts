import { describe, expect, it } from "vitest";
import type { SortCategoriesConfig } from "@/content/activity-configs";
import {
  assignmentsComplete,
  initialItemOrder,
  placeItem,
  sortSeed,
  unplaceItem,
  type SortAssignment,
} from "./model";

const config: SortCategoriesConfig = {
  instruction: "Sort the animals.",
  bins: [
    { id: "land", label: "Land", emoji: "🌳" },
    { id: "water", label: "Water", emoji: "🌊" },
  ],
  items: [
    { label: "Frog", emoji: "🐸", binId: "water" },
    { label: "Dog", emoji: "🐶", binId: "land" },
    { label: "Fish", emoji: "🐟", binId: "water" },
  ],
};

describe("sort-categories model", () => {
  it("derives a stable, non-identity source order from the full config", () => {
    expect(initialItemOrder(config)).toEqual(initialItemOrder(config));
    expect(initialItemOrder(config)).not.toEqual([0, 1, 2]);

    const sameLengthLabels: SortCategoriesConfig = {
      ...config,
      items: config.items.map((item, itemIndex) =>
        itemIndex === 1 ? { ...item, label: "Cat" } : item,
      ),
    };
    expect(sortSeed(sameLengthLabels)).not.toBe(sortSeed(config));
  });

  it("places an item, moves it between bins, and unplaces it", () => {
    const placed = placeItem([], 0, "land", config);
    expect(placed).toEqual([{ itemIndex: 0, binId: "land" }]);

    const moved = placeItem(placed, 0, "water", config);
    expect(moved).toEqual([{ itemIndex: 0, binId: "water" }]);

    expect(unplaceItem(moved, 0)).toEqual([]);
  });

  it("ignores impossible item and bin identifiers", () => {
    const original: SortAssignment[] = [{ itemIndex: 0, binId: "land" }];
    expect(placeItem(original, -1, "land", config)).toBe(original);
    expect(placeItem(original, 3, "land", config)).toBe(original);
    expect(placeItem(original, 1, "sky", config)).toBe(original);
  });

  it("recognizes only a complete, duplicate-free assignment", () => {
    expect(
      assignmentsComplete(config, [
        { itemIndex: 2, binId: "water" },
        { itemIndex: 0, binId: "water" },
        { itemIndex: 1, binId: "land" },
      ]),
    ).toBe(true);
    expect(
      assignmentsComplete(config, [
        { itemIndex: 0, binId: "water" },
        { itemIndex: 0, binId: "land" },
        { itemIndex: 2, binId: "water" },
      ]),
    ).toBe(false);
    expect(
      assignmentsComplete(config, [
        { itemIndex: 0, binId: "water" },
        { itemIndex: 1, binId: "land" },
      ]),
    ).toBe(false);
  });
});
