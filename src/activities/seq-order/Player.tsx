"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { SeqOrderConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { shuffle } from "../_shared/shuffle";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { schema, score, type SeqOrderResponse } from "./logic";

export function SeqOrderPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<SeqOrderConfig, SeqOrderResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  // Deterministic shuffle (never Math.random()) so the layout is stable across
  // re-renders but varied across content, same idiom as sightword-game's Player.
  const [deck] = useState(() => {
    const seed = parsed.cards.map((c) => c.label).join("").length;
    return shuffle(
      parsed.cards.map((card, originalIndex) => ({ card, originalIndex })),
      seed,
    );
  });

  const [attempts, setAttempts] = useState(0);
  // Original card indices, in the order the child has tapped them so far.
  const [order, setOrder] = useState<number[]>([]);
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  const [done, setDone] = useState<SeqOrderResponse | null>(null);

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="You put them in order."
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  function tapCard(originalIndex: number) {
    if (shake.wrong || order.includes(originalIndex)) return;

    if (originalIndex === order.length) {
      const next = [...order, originalIndex];
      setOrder(next);
      if (next.length === parsed.cards.length) {
        // attempts counts only mistakes across the whole sequence; the completing
        // tap reports mistakes + 1 (mirrors sort-categories' tapBin), so a
        // flawless order scores first-try (3 stars), not one increment per card.
        setDone({ attempts: attempts + 1, order: next });
      }
    } else {
      setAttempts(attempts + 1);
      setWrongIndex(originalIndex);
      shake.trigger({
        speak: () => speech.speak("Try the next one."),
        onClear: () => setWrongIndex(null),
      });
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
        {deck.map(({ card, originalIndex }) => {
          if (order.includes(originalIndex)) return null;
          return (
            <motion.button
              key={originalIndex}
              type="button"
              onClick={() => tapCard(originalIndex)}
              disabled={shake.wrong}
              aria-label={`${card.label}, tap to place next`}
              animate={wrongIndex === originalIndex ? shake.shakeProps(reduced).animate : { x: 0 }}
              transition={shake.shakeProps(reduced).transition}
              className={cn(
                "grid min-h-11 place-items-center gap-1 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-5 text-ink shadow-pop transition duration-200 ease-out",
                "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {card.emoji && (
                <span className="text-4xl" role="img" aria-hidden="true">
                  {card.emoji}
                </span>
              )}
              <span className="font-display text-lg">{card.label}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-3">
        {order.map((originalIndex, position) => {
          const card = parsed.cards[originalIndex];
          return (
            <div
              key={originalIndex}
              className="grid min-h-11 place-items-center gap-1 rounded-2xl border-[3px] border-solid border-ink bg-honey/40 px-4 py-3 text-ink"
            >
              <span className="font-display text-xs uppercase tracking-wide">{position + 1}</span>
              <div className="flex items-center gap-1">
                {card.emoji && (
                  <span className="text-2xl" role="img" aria-hidden="true">
                    {card.emoji}
                  </span>
                )}
                <span className="font-display text-base">{card.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <ProgressHint>
        {order.length} of {parsed.cards.length} in order
      </ProgressHint>

      <PlayerControls>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
      </PlayerControls>
    </div>
  );
}
