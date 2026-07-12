"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { schema, score, type SortCategoriesResponse } from "./logic";

export function SortCategoriesPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<SortCategoriesConfig, SortCategoriesResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [attempts, setAttempts] = useState(0);
  // One slot per item, in item-index order; empty string = not yet placed.
  const [placements, setPlacements] = useState<string[]>(() => parsed.items.map(() => ""));
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongBin, setWrongBin] = useState<string | null>(null);
  const [done, setDone] = useState<SortCategoriesResponse | null>(null);

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="You sorted them all."
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  const placedCount = placements.filter((p) => p !== "").length;

  function tapItem(index: number) {
    if (shake.wrong || placements[index] !== "") return;
    setSelected((prev) => (prev === index ? null : index));
  }

  function tapBin(binId: string) {
    if (shake.wrong || selected === null) return;
    const item = parsed.items[selected];

    if (item.binId === binId) {
      const next = placements.slice();
      next[selected] = binId;
      setPlacements(next);
      setSelected(null);
      if (next.every((p) => p !== "")) {
        // attempts counts only mistakes across the whole sort; the completing
        // placement reports mistakes + 1 (mirrors math-money's tapIdentify), so
        // a flawless sort scores first-try (3 stars), not one increment per item.
        setDone({ attempts: attempts + 1, placements: next });
      }
    } else {
      setAttempts(attempts + 1);
      setWrongBin(binId);
      shake.trigger({
        speak: () => speech.speak("Try a different group."),
        onClear: () => setWrongBin(null),
      });
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {parsed.items.map((item, i) => {
          if (placements[i] !== "") return null;
          const isSelected = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => tapItem(i)}
              disabled={shake.wrong}
              aria-pressed={isSelected}
              aria-label={item.label}
              className={cn(
                "grid min-h-24 place-items-center gap-1 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-5 text-ink shadow-pop transition duration-200 ease-out",
                "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                "disabled:pointer-events-none disabled:opacity-50",
                isSelected && "bg-honey/40 ring-4 ring-honey",
              )}
            >
              {item.emoji && (
                <span className="text-4xl" role="img" aria-hidden="true">
                  {item.emoji}
                </span>
              )}
              <span className="font-display text-lg">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-auto grid w-full max-w-2xl gap-4 sm:grid-cols-2 md:grid-cols-4">
        {parsed.bins.map((bin) => (
          <motion.button
            key={bin.id}
            type="button"
            onClick={() => tapBin(bin.id)}
            disabled={shake.wrong || selected === null}
            aria-label={`Put in ${bin.label} bin`}
            animate={wrongBin === bin.id ? shake.shakeProps(reduced).animate : { x: 0 }}
            transition={shake.shakeProps(reduced).transition}
            className={cn(
              "grid min-h-24 place-items-center gap-2 rounded-2xl border-[3px] border-dashed border-ink/40 bg-paper-sunk px-4 py-6 text-ink transition duration-200 ease-out",
              "disabled:opacity-50",
              selected !== null && !shake.wrong && "border-solid border-ink bg-paper-raised shadow-pop hover:-translate-y-0.5",
            )}
          >
            {bin.emoji && (
              <span className="text-3xl" role="img" aria-hidden="true">
                {bin.emoji}
              </span>
            )}
            <span className="font-display text-base">{bin.label}</span>
            <div className="flex flex-wrap justify-center gap-1" aria-hidden="true">
              {parsed.items.map((item, i) =>
                placements[i] === bin.id ? (
                  <span key={i} className="text-xl">
                    {item.emoji ?? item.label}
                  </span>
                ) : null,
              )}
            </div>
          </motion.button>
        ))}
      </div>

      <ProgressHint>
        {placedCount} of {parsed.items.length} sorted
      </ProgressHint>

      <PlayerControls>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
      </PlayerControls>
    </div>
  );
}
