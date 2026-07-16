import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTileToBuild,
  createTileInventory,
  findExactSegmentation,
  releaseTileFromBuild,
  startPhonemeSweep,
  validatePhonicsInventory,
} from "./model";

describe("phonics tile inventory", () => {
  it("gives repeated graphemes stable, separate instances", () => {
    expect(createTileInventory(["b", "a", "l", "l"])).toEqual([
      { index: 0, text: "b" },
      { index: 1, text: "a" },
      { index: 2, text: "l" },
      { index: 3, text: "l" },
    ]);
  });

  it("consumes and releases an exact tile instance by index", () => {
    expect(addTileToBuild([], 2, 4)).toEqual([2]);
    expect(addTileToBuild([2], 2, 4)).toEqual([2]);
    expect(addTileToBuild([2], 3, 4)).toEqual([2, 3]);
    expect(addTileToBuild([2], 9, 4)).toEqual([2]);
    expect(releaseTileFromBuild([0, 2, 3], 2)).toEqual([0, 3]);
  });
});

describe("phoneme sweep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("voices retained tiles in order, skips silent tiles, then blends the word", () => {
    const active: (number | null)[] = [];
    const spoken: string[] = [];
    const done = vi.fn();
    startPhonemeSweep({
      tileIndices: [2, 0, 3, 1],
      tiles: ["i", "e", "sh", "n"],
      silent: ["e"],
      onActiveTile: (index) => active.push(index),
      onSpeakTile: (tile) => spoken.push(tile),
      onSpeakWord: () => spoken.push("shine"),
      onDone: done,
      dwellMs: 100,
    });

    expect(active).toEqual([2]);
    expect(spoken).toEqual(["sh"]);
    vi.advanceTimersByTime(100);
    expect(active).toEqual([2, 0]);
    expect(spoken).toEqual(["sh", "i"]);
    vi.advanceTimersByTime(100);
    expect(active).toEqual([2, 0, 3]);
    expect(spoken).toEqual(["sh", "i", "n"]);
    vi.advanceTimersByTime(100);
    expect(active.at(-1)).toBeNull();
    expect(spoken).toEqual(["sh", "i", "n", "shine"]);
    vi.advanceTimersByTime(100);
    expect(done).toHaveBeenCalledOnce();
  });

  it("cancels every pending step and clears visual focus", () => {
    const active: (number | null)[] = [];
    const spoken: string[] = [];
    const cancel = startPhonemeSweep({
      tileIndices: [0, 1],
      tiles: ["c", "a"],
      onActiveTile: (index) => active.push(index),
      onSpeakTile: (tile) => spoken.push(tile),
      onSpeakWord: () => spoken.push("ca"),
      onDone: () => spoken.push("done"),
      dwellMs: 100,
    });
    cancel();
    vi.runAllTimers();
    expect(active).toEqual([0, null]);
    expect(spoken).toEqual(["c"]);
  });
});

describe("exact segmentation", () => {
  it("uses inventory multiplicity for repeated letters", () => {
    expect(findExactSegmentation("ball", ["b", "a", "l", "l"])).toEqual([0, 1, 2, 3]);
    expect(findExactSegmentation("ball", ["b", "a", "l"])).toBeNull();
  });

  it("prefers a complete multi-character grapheme segmentation", () => {
    expect(findExactSegmentation("ship", ["s", "h", "sh", "i", "p"])).toEqual([2, 3, 4]);
    expect(findExactSegmentation("the", ["th", "t", "h", "e"])).toEqual([0, 3]);
  });

  it("does not fall back to letters that are not in the inventory", () => {
    expect(findExactSegmentation("chat", ["ch", "a"])).toBeNull();
  });
});

describe("phonics config consistency", () => {
  const base = {
    tiles: ["sh", "i", "p", "e"],
    words: [{ word: "ship" }],
  };

  it("accepts buildable words and declared audio keys", () => {
    expect(
      validatePhonicsInventory({ ...base, say: { sh: "sh" }, silent: ["e"] }),
    ).toBeNull();
  });

  it("rejects generated words that exceed supplied multiplicity", () => {
    expect(validatePhonicsInventory({ tiles: ["b", "a", "l"], words: [{ word: "ball" }] }))
      .toContain("cannot be built");
  });

  it("rejects say and silent keys outside the tile inventory", () => {
    expect(validatePhonicsInventory({ ...base, say: { ch: "ch" } })).toContain("say key");
    expect(validatePhonicsInventory({ ...base, silent: ["x"] })).toContain("silent tile");
  });
});
