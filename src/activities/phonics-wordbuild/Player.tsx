"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon, BackspaceIcon } from "@phosphor-icons/react/dist/ssr";
import type { PhonicsWordbuildConfig } from "@/content/activity-configs";
import { segmentWord } from "@/content/phonics";
import type { ActivityPlayerProps } from "@/content/types";
import { tilePhonemeText, wordPhonemeText } from "@/lib/audio/phonemes";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { shuffle } from "../_shared/shuffle";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { schema, score, type PhonicsWordbuildResponse } from "./logic";

export function PhonicsWordbuildPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<PhonicsWordbuildConfig, PhonicsWordbuildResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [wordIndex, setWordIndex] = useState(0);
  const [built, setBuilt] = useState<string[]>([]);
  const [tries, setTries] = useState(1);
  const [builds, setBuilds] = useState<PhonicsWordbuildResponse["builds"]>([]);
  const [done, setDone] = useState<PhonicsWordbuildResponse | null>(null);

  const current = parsed.words[wordIndex];
  const targetSegments = useMemo(
    () => (current ? segmentWord(current.word, parsed.tiles) : []),
    [current, parsed.tiles],
  );
  const tray = useMemo(
    () => shuffle(parsed.tiles, parsed.tiles.join("").length + wordIndex * 7),
    [parsed.tiles, wordIndex],
  );

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="You built every word."
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  if (!current) return null;

  const isComplete = built.length === targetSegments.length;

  function tapTile(tile: string) {
    if (shake.wrong || isComplete) return;
    setBuilt((prev) => [...prev, tile]);
    // Silent letters (e.g. the magic-e) fill the slot but make no sound — cancel
    // any in-flight utterance so a quick tap can't leave the prior tile audible.
    if (parsed.silent?.includes(tile)) {
      speech.cancel();
      return;
    }
    // A lone tile is voiced out of context; its authored IPA (when present) makes
    // the neural voice say the in-word sound instead of mis-reading the spelling.
    const tts = tilePhonemeText(tile, parsed.say);
    speech.speak(tile, tts ? { tts } : undefined);
  }

  function undo() {
    setBuilt((prev) => prev.slice(0, -1));
  }

  function clearBuild() {
    setBuilt([]);
  }

  function check() {
    const correct = built.join("").toLowerCase() === targetSegments.join("").toLowerCase();
    if (correct) {
      const nextBuilds = [...builds, { word: current.word, tries }];
      setBuilds(nextBuilds);
      const isLast = wordIndex === parsed.words.length - 1;
      if (isLast) {
        setDone({ builds: nextBuilds });
      } else {
        setWordIndex((i) => i + 1);
        setBuilt([]);
        setTries(1);
      }
    } else {
      // Forgiving: no red X. Gentle nudge, clear, and let them try again.
      setTries((t) => t + 1);
      shake.trigger({
        speak: () => speech.speak("So close. Let's try that one again."),
        onClear: () => setBuilt([]),
      });
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {/* Target picture + the word's spoken form */}
      <div className="flex flex-col items-center gap-3">
        {current.picture && (
          <motion.div
            key={current.word}
            className="grid size-36 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised shadow-pop"
            initial={reduced ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-7xl" role="img" aria-label={current.word}>
              {current.picture}
            </span>
          </motion.div>
        )}
        <div className="flex items-center gap-2">
          <SpeakerButton
            speech={speech}
            text={current.word}
            tts={wordPhonemeText(current.word, current.ipa)}
            label={`Say the word ${current.word}`}
          />
          <span className="text-sm text-ink-soft">Word {wordIndex + 1} of {parsed.words.length}</span>
        </div>
      </div>

      {/* Build slots */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2"
        {...shake.shakeProps(reduced)}
        aria-live="polite"
      >
        {targetSegments.map((_, slot) => {
          const filled = built[slot];
          return (
            <span
              key={slot}
              className={cn(
                "grid h-16 min-w-16 place-items-center rounded-xl border-[3px] px-3 font-display text-3xl",
                filled
                  ? "border-ink bg-honey text-ink shadow-pop"
                  : "border-dashed border-ink/30 bg-paper-sunk text-ink/30",
              )}
            >
              {filled ?? ""}
            </span>
          );
        })}
      </motion.div>

      {/* Tile tray */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {tray.map((tile, i) => (
          <button
            key={`${tile}-${i}`}
            type="button"
            onClick={() => tapTile(tile)}
            disabled={shake.wrong}
            aria-label={`Letter tile ${tile}`}
            className={cn(
              "grid h-24 min-w-24 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised px-4",
              "font-display text-3xl text-ink shadow-pop transition duration-200 ease-out",
              "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-50",
            )}
          >
            {tile}
          </button>
        ))}
      </div>

      {/* Controls: undo / clear / done — forgiving, no scoring penalty */}
      <PlayerControls>
        <Button variant="soft" size="md" onClick={undo} disabled={built.length === 0 || shake.wrong}>
          <BackspaceIcon weight="bold" aria-hidden="true" />
          Undo
        </Button>
        <Button variant="soft" size="md" onClick={clearBuild} disabled={built.length === 0 || shake.wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Start over
        </Button>
        <Button variant="primary" size="kid" onClick={check} disabled={!isComplete || shake.wrong}>
          Check it
        </Button>
      </PlayerControls>
    </div>
  );
}
