import { describe, it, expect } from "vitest";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  it("is deterministic: the same seed yields the same order", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42));
  });

  it("different seeds generally yield different orders", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(shuffle(items, 1)).not.toEqual(shuffle(items, 2));
  });

  it("preserves the multiset of elements (a permutation)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const out = shuffle(items, 9999);
    expect(out).toHaveLength(items.length);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("does not mutate the input array", () => {
    const items = ["x", "y", "z"];
    const copy = [...items];
    shuffle(items, 7);
    expect(items).toEqual(copy);
  });

  it("treats seed 0 as 1 (the `seed || 1` guard), so it still permutes", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffle(items, 0)).toEqual(shuffle(items, 1));
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([], 5)).toEqual([]);
    expect(shuffle(["solo"], 5)).toEqual(["solo"]);
  });
});
