import { describe, expect, it } from "vitest";
import type { SeqOrderConfig } from "@/content/activity-configs";
import {
  emptySequenceSlots,
  initialCardOrder,
  moveCard,
  placeCard,
  sequenceComplete,
  sequenceSeed,
  unplaceCard,
} from "./model";

const config: SeqOrderConfig = {
  instruction: "Put the life cycle in order.",
  cards: [
    { label: "Egg", emoji: "🥚" },
    { label: "Caterpillar", emoji: "🐛" },
    { label: "Chrysalis", emoji: "🛡️" },
    { label: "Butterfly", emoji: "🦋" },
  ],
};

describe("seq-order model", () => {
  it("derives a stable, non-identity deck from full config and indices", () => {
    expect(initialCardOrder(config)).toEqual(initialCardOrder(config));
    expect(initialCardOrder(config)).not.toEqual([0, 1, 2, 3]);

    const sameLengthLabel: SeqOrderConfig = {
      ...config,
      cards: config.cards.map((card, index) =>
        index === 0 ? { ...card, label: "Ant" } : card,
      ),
    };
    expect(sequenceSeed(sameLengthLabel)).not.toBe(sequenceSeed(config));
  });

  it("starts with every numbered slot empty", () => {
    expect(emptySequenceSlots(config.cards.length)).toEqual([null, null, null, null]);
  });

  it("allows any card in any slot and moves a card into an empty slot", () => {
    const arbitrary = placeCard(emptySequenceSlots(4), 3, 0);
    expect(arbitrary).toEqual([3, null, null, null]);
    expect(placeCard(arbitrary, 3, 2)).toEqual([null, null, 3, null]);
  });

  it("swaps cards when a placed card moves into an occupied slot", () => {
    expect(placeCard([0, 1, null, null], 0, 1)).toEqual([1, 0, null, null]);
  });

  it("returns an occupied card to the tray when a tray card replaces it", () => {
    expect(placeCard([0, null, null, null], 2, 0)).toEqual([2, null, null, null]);
  });

  it("unplaces and Arrow-reorders cards without exposing correctness", () => {
    expect(unplaceCard([0, 1, 2, 3], 1)).toEqual([0, null, 2, 3]);
    expect(moveCard([0, 1, 2, 3], 1, -1)).toEqual([1, 0, 2, 3]);
    expect(moveCard([0, 1, 2, 3], 1, 1)).toEqual([0, 2, 1, 3]);
    expect(moveCard([0, 1, 2, 3], 0, -1)).toEqual([0, 1, 2, 3]);
  });

  it("requires a complete card permutation", () => {
    expect(sequenceComplete([3, 1, 0, 2], 4)).toBe(true);
    expect(sequenceComplete([3, 1, null, 2], 4)).toBe(false);
    expect(sequenceComplete([3, 1, 1, 2], 4)).toBe(false);
  });
});
