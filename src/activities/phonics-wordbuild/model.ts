export const MAX_PHONICS_TILES = 16;
export const MAX_PHONICS_WORDS = 12;
export const MAX_PHONICS_ATTEMPTS = 20;

export interface PhonicsTile {
  index: number;
  text: string;
}

interface PhonemeSweepOptions {
  tileIndices: readonly number[];
  tiles: readonly string[];
  silent?: readonly string[];
  onActiveTile: (tileIndex: number | null) => void;
  onSpeakTile: (tile: string, tileIndex: number) => void;
  onSpeakWord: () => void;
  onDone: () => void;
  dwellMs?: number;
}

interface InventoryConfig {
  tiles: readonly string[];
  words: readonly { word: string }[];
  say?: Readonly<Record<string, string>>;
  silent?: readonly string[];
}

export function createTileInventory(tiles: readonly string[]): PhonicsTile[] {
  return tiles.map((text, index) => ({ index, text }));
}

export function addTileToBuild(
  tileIndices: readonly number[],
  tileIndex: number,
  inventorySize: number,
): number[] {
  if (
    !Number.isInteger(tileIndex) ||
    tileIndex < 0 ||
    tileIndex >= inventorySize ||
    tileIndices.includes(tileIndex)
  ) {
    return [...tileIndices];
  }
  return [...tileIndices, tileIndex];
}

export function releaseTileFromBuild(
  tileIndices: readonly number[],
  tileIndex: number,
): number[] {
  return tileIndices.filter((index) => index !== tileIndex);
}

/**
 * Runs a cancellable, retained-build sound sweep. Silent tiles stay visible in
 * the word but are omitted from the voiced/highlighted sequence.
 */
export function startPhonemeSweep({
  tileIndices,
  tiles,
  silent = [],
  onActiveTile,
  onSpeakTile,
  onSpeakWord,
  onDone,
  dwellMs = 700,
}: PhonemeSweepOptions): () => void {
  const silentTiles = new Set(silent);
  const voiced = tileIndices.filter((index) => {
    const tile = tiles[index];
    return tile !== undefined && !silentTiles.has(tile);
  });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let cancelled = false;

  const later = (callback: () => void): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!cancelled) callback();
    }, dwellMs);
    timers.add(timer);
  };

  const blend = (): void => {
    onActiveTile(null);
    onSpeakWord();
    later(onDone);
  };

  const visit = (position: number): void => {
    const tileIndex = voiced[position];
    const tile = tileIndex === undefined ? undefined : tiles[tileIndex];
    if (tileIndex === undefined || tile === undefined) {
      blend();
      return;
    }
    onActiveTile(tileIndex);
    onSpeakTile(tile, tileIndex);
    later(() => visit(position + 1));
  };

  visit(0);
  return () => {
    cancelled = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    onActiveTile(null);
  };
}

/**
 * Finds one exact, no-reuse segmentation using stable inventory indexes.
 * Longer graphemes are considered first so a complete `sh-i-p` build wins over
 * `s-h-i-p`, while backtracking still finds a valid alternative when needed.
 */
export function findExactSegmentation(
  word: string,
  tiles: readonly string[],
): number[] | null {
  return findExactTileSegmentation(word, tiles);
}

export function constructedText(tileIndices: readonly number[], tiles: readonly string[]): string {
  return tileIndices.map((index) => tiles[index] ?? "").join("");
}

export function isExactBuild(
  word: string,
  tileIndices: readonly number[],
  tiles: readonly string[],
): boolean {
  const unique = new Set(tileIndices);
  return (
    unique.size === tileIndices.length &&
    tileIndices.every((index) => Number.isInteger(index) && index >= 0 && index < tiles.length) &&
    constructedText(tileIndices, tiles).toLocaleLowerCase() === word.toLocaleLowerCase()
  );
}

/** Server-safe authored/generated config consistency check. */
export function validatePhonicsInventory(config: InventoryConfig): string | null {
  return validatePhonicsTileInventory(config);
}
import {
  findExactTileSegmentation,
  validatePhonicsTileInventory,
} from "@/content/phonics";
