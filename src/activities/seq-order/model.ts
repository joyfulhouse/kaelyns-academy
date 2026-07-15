import type { SeqOrderConfig } from "@/content/activity-configs";
import { shuffleNonIdentity, stableSeed } from "../_shared/shuffle";

export type SequenceSlot = number | null;

/** Full authored identity, including every card index, seeds the source deck. */
export function sequenceSeed(config: SeqOrderConfig): number {
  return stableSeed([
    "seq-order",
    config.instruction,
    ...config.cards.flatMap((card, cardIndex) => [cardIndex, card.label, card.emoji]),
  ]);
}

export function initialCardOrder(config: SeqOrderConfig): number[] {
  return shuffleNonIdentity(
    config.cards.map((_card, cardIndex) => cardIndex),
    sequenceSeed(config),
  );
}

export function emptySequenceSlots(length: number): SequenceSlot[] {
  return Array.from({ length }, () => null);
}

/**
 * Place a card in any numbered slot. Moving a placed card onto an occupied
 * slot swaps the two cards; placing a tray card there returns the old card to
 * the tray. No operation depends on the authored correct order.
 */
export function placeCard(
  slots: readonly SequenceSlot[],
  cardIndex: number,
  position: number,
): SequenceSlot[] {
  if (
    !Number.isInteger(cardIndex) ||
    cardIndex < 0 ||
    cardIndex >= slots.length ||
    !Number.isInteger(position) ||
    position < 0 ||
    position >= slots.length
  ) {
    return slots as SequenceSlot[];
  }

  const sourcePosition = slots.indexOf(cardIndex);
  if (sourcePosition === position) return slots as SequenceSlot[];

  const next = [...slots];
  const displaced = next[position];
  next[position] = cardIndex;
  if (sourcePosition >= 0) next[sourcePosition] = displaced;
  return next;
}

export function unplaceCard(
  slots: readonly SequenceSlot[],
  cardIndex: number,
): SequenceSlot[] {
  const position = slots.indexOf(cardIndex);
  if (position < 0) return slots as SequenceSlot[];
  const next = [...slots];
  next[position] = null;
  return next;
}

export function moveCard(
  slots: readonly SequenceSlot[],
  cardIndex: number,
  direction: -1 | 1,
): SequenceSlot[] {
  const position = slots.indexOf(cardIndex);
  if (position < 0) return slots as SequenceSlot[];
  const destination = position + direction;
  if (destination < 0 || destination >= slots.length) return slots as SequenceSlot[];
  return placeCard(slots, cardIndex, destination);
}

export function sequenceComplete(
  slots: readonly SequenceSlot[],
  cardCount: number,
): slots is number[] {
  if (slots.length !== cardCount || slots.some((slot) => slot === null)) return false;
  const cardIndices = new Set(slots);
  return (
    cardIndices.size === cardCount &&
    slots.every(
      (cardIndex) =>
        cardIndex !== null &&
        Number.isInteger(cardIndex) &&
        cardIndex >= 0 &&
        cardIndex < cardCount,
    )
  );
}
