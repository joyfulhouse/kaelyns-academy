"use client";

import { useRef, useState } from "react";
import type { SeqOrderConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { isCorrect, schema, type SeqOrderResponse } from "./logic";
import {
  emptySequenceSlots,
  initialCardOrder,
  moveCard,
  placeCard,
  sequenceComplete,
  unplaceCard,
  type SequenceSlot,
} from "./model";

const MAX_CHECKS = 20;
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"] as const;

export function SeqOrderPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<SeqOrderConfig, SeqOrderResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const slotRefs = useRef(new Map<number, HTMLButtonElement>());

  const [deck] = useState(() => initialCardOrder(parsed));
  const [slots, setSlots] = useState<SequenceSlot[]>(() =>
    emptySequenceSlots(parsed.cards.length),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [announcement, setAnnouncement] = useState(
    "Choose any card, then choose any numbered place.",
  );

  useSpeakOnce(speech.speak, parsed.instruction);

  function selectCard(cardIndex: number) {
    const card = parsed.cards[cardIndex];
    const currentPosition = slots.indexOf(cardIndex);
    setSelected((current) => (current === cardIndex ? null : cardIndex));
    setAnnouncement(
      selected === cardIndex
        ? `${card.label} is no longer selected.`
        : `${card.label} selected${currentPosition >= 0 ? ` from ${ordinal(currentPosition)}` : ""}. Choose a numbered place.`,
    );
  }

  function focusSlot(position: number) {
    window.requestAnimationFrame(() => slotRefs.current.get(position)?.focus());
  }

  function handleSlot(position: number) {
    const cardAtPosition = slots[position];
    if (selected === null) {
      if (cardAtPosition !== null) selectCard(cardAtPosition);
      return;
    }

    const card = parsed.cards[selected];
    setSlots((current) => placeCard(current, selected, position));
    setSelected(null);
    setAnnouncement(`${card.label} moved to ${ordinal(position)}.`);
  }

  function returnSelectedToDeck() {
    if (selected === null || slots.indexOf(selected) < 0) return;
    const card = parsed.cards[selected];
    setSlots((current) => unplaceCard(current, selected));
    setSelected(null);
    setAnnouncement(`${card.label} returned to the card tray.`);
  }

  function reorderWithArrow(
    event: React.KeyboardEvent<HTMLButtonElement>,
    cardIndex: number,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const oldPosition = slots.indexOf(cardIndex);
    const newPosition = oldPosition + direction;
    if (newPosition < 0 || newPosition >= slots.length) {
      setAnnouncement(`${parsed.cards[cardIndex].label} is already at the end.`);
      return;
    }
    setSlots((current) => moveCard(current, cardIndex, direction));
    setSelected(cardIndex);
    setAnnouncement(`${parsed.cards[cardIndex].label} moved to ${ordinal(newPosition)}.`);
    focusSlot(newPosition);
  }

  function checkWork() {
    if (!sequenceComplete(slots, parsed.cards.length)) return;
    const nextAttempts = Math.min(attempts + 1, MAX_CHECKS);
    const response: SeqOrderResponse = { attempts: nextAttempts, order: [...slots] };
    if (isCorrect(parsed, response)) {
      onComplete(response);
      return;
    }
    setAttempts(nextAttempts);
    setAnnouncement(
      "That order needs another look. Every card stayed where you put it, so move any card and try again.",
    );
    speech.speak("That order needs another look. Move any card and try again.");
  }

  const placedCount = slots.filter((slot) => slot !== null).length;
  const selectedPosition = selected === null ? -1 : slots.indexOf(selected);
  const complete = sequenceComplete(slots, parsed.cards.length);

  return (
    <div className="grid gap-7">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <section
        aria-labelledby="sequence-deck-title"
        className="grid gap-3 rounded-2xl border-[3px] border-ink/30 bg-paper-sunk p-4"
      >
        <h2 id="sequence-deck-title" className="font-display text-lg text-ink">
          Cards to place
        </h2>
        <ul aria-label="Cards waiting for a numbered place" className="flex min-h-24 flex-wrap gap-3">
          {deck.map((cardIndex) => {
            if (slots.includes(cardIndex)) return null;
            const card = parsed.cards[cardIndex];
            return (
              <li key={cardIndex}>
                <CardButton
                  card={card}
                  selected={selected === cardIndex}
                  label={`${card.label}, in the card tray`}
                  onClick={() => selectCard(cardIndex)}
                />
              </li>
            );
          })}
          {placedCount === parsed.cards.length && (
            <li className="grid min-h-16 place-items-center text-sm text-ink-soft">
              Every card has a place. You can still rearrange them.
            </li>
          )}
        </ul>
      </section>

      <ol aria-label="Your sequence" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((cardIndex, position) => {
          const card = cardIndex === null ? null : parsed.cards[cardIndex];
          const selectedCard = selected === null ? null : parsed.cards[selected];
          return (
            <li
              key={position}
              className="grid content-start gap-2 rounded-2xl border-[3px] border-ink bg-paper-raised p-3 shadow-pop"
            >
              <p className="text-center font-display text-lg text-ink-soft">
                {ordinal(position)}
              </p>
              <button
                ref={(node) => {
                  if (node) slotRefs.current.set(position, node);
                  else slotRefs.current.delete(position);
                }}
                type="button"
                onClick={() => handleSlot(position)}
                onKeyDown={(event) => {
                  if (cardIndex !== null) reorderWithArrow(event, cardIndex);
                }}
                aria-pressed={cardIndex !== null && selected === cardIndex}
                aria-label={slotLabel(position, card, selectedCard)}
                className={cn(
                  "grid min-h-24 place-items-center gap-1 rounded-xl border-[3px] border-dashed border-ink/30 px-4 py-3 text-ink",
                  "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1",
                  card && "border-solid border-ink bg-honey/30 shadow-pop",
                  cardIndex !== null && selected === cardIndex && "bg-honey ring-4 ring-honey/50",
                  selected !== null && selected !== cardIndex && "border-solid border-accent-deep bg-accent/12",
                )}
              >
                {card ? (
                  <>
                    {card.emoji && (
                      <span className="text-3xl" role="img" aria-hidden="true">
                        {card.emoji}
                      </span>
                    )}
                    <span className="font-display text-lg">{card.label}</span>
                    <span className="text-xs text-ink-soft">Arrow keys move this card</span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-ink-soft">
                    {selectedCard ? `Put ${selectedCard.label} here` : "Choose a card"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <ProgressHint>
        {placedCount} of {parsed.cards.length} placed
      </ProgressHint>
      <p className="min-h-6 text-center text-sm font-semibold text-ink-soft" role="status" aria-live="polite">
        {announcement}
      </p>

      <PlayerControls>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {selected !== null && selectedPosition >= 0 && (
          <Button variant="soft" size="md" onClick={returnSelectedToDeck}>
            Return {parsed.cards[selected].label} to tray
          </Button>
        )}
        <Button variant="primary" size="kid" onClick={checkWork} disabled={!complete}>
          Check my order
        </Button>
      </PlayerControls>
    </div>
  );
}

function CardButton({
  card,
  selected,
  label,
  onClick,
}: {
  card: SeqOrderConfig["cards"][number];
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "grid min-h-24 min-w-28 place-items-center gap-1 rounded-xl border-[3px] border-ink bg-paper-raised px-4 py-3 text-ink shadow-pop",
        "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        selected && "bg-honey ring-4 ring-honey/50",
      )}
    >
      {card.emoji && (
        <span className="text-3xl" role="img" aria-hidden="true">
          {card.emoji}
        </span>
      )}
      <span className="font-display text-lg">{card.label}</span>
    </button>
  );
}

function ordinal(position: number): string {
  return ORDINALS[position] ?? `${position + 1}th`;
}

function slotLabel(
  position: number,
  card: SeqOrderConfig["cards"][number] | null,
  selectedCard: SeqOrderConfig["cards"][number] | null,
): string {
  if (selectedCard && card === selectedCard) {
    return `${ordinal(position)}, ${card.label}, selected. Use Left and Right Arrow to reorder`;
  }
  if (selectedCard) {
    return card
      ? `Put ${selectedCard.label} in ${ordinal(position)}, swapping with ${card.label}`
      : `Put ${selectedCard.label} in ${ordinal(position)}`;
  }
  return card
    ? `${ordinal(position)}, ${card.label}. Select it or use Left and Right Arrow to reorder`
    : `${ordinal(position)} position, empty. Select a card first`;
}
