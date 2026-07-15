"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { SightwordGameConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { shuffle } from "../_shared/shuffle";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { schema, type SightwordGameResponse } from "./logic";

interface Card {
  word: string;
  isTarget: boolean;
}

export function SightwordGamePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<SightwordGameConfig, SightwordGameResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();

  const cards = useMemo<Card[]>(() => {
    const targets: Card[] = parsed.words.map((word) => ({ word, isTarget: true }));
    const decoys: Card[] = parsed.decoys.map((word) => ({ word, isTarget: false }));
    return shuffle([...targets, ...decoys], parsed.words.join("").length + parsed.decoys.length);
  }, [parsed.words, parsed.decoys]);

  const [found, setFound] = useState<string[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [decoyTaps, setDecoyTaps] = useState(0);

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  function tap(card: Card) {
    speech.speak(card.word);
    if (card.isTarget) {
      if (found.includes(card.word)) return;
      const next = [...found, card.word];
      setFound(next);
      setNudge(null);
      if (next.length === parsed.words.length) {
        onComplete({ found: next, decoyTaps });
      }
    } else {
      // Forgiving: a decoy is a gentle "not that one", never a failure.
      setDecoyTaps((n) => n + 1);
      setNudge(card.word);
      speech.speak("Hmm, keep looking.");
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <ProgressHint>
        Found {found.length} of {parsed.words.length}
      </ProgressHint>

      <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const isFound = card.isTarget && found.includes(card.word);
          const isNudging = nudge === card.word;
          return (
            <motion.button
              key={card.word}
              type="button"
              onClick={() => tap(card)}
              disabled={isFound}
              aria-label={isFound ? `${card.word}, found` : card.word}
              aria-pressed={isFound}
              animate={isNudging && !reduced ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
              className={cn(
                "relative grid min-h-24 place-items-center rounded-2xl border-[3px] border-ink px-4 py-5",
                "font-display text-2xl shadow-pop transition duration-200 ease-out",
                "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                isFound
                  ? "bg-success/25 text-ink opacity-75 cursor-not-allowed"
                  : "bg-paper-raised text-ink",
              )}
            >
              {card.word}
              {isFound && (
                <CheckCircleIcon
                  size={26}
                  weight="fill"
                  aria-hidden="true"
                  className="absolute right-2 top-2 text-success"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
      </div>
    </div>
  );
}
