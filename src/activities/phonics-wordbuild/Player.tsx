"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon, BackspaceIcon } from "@phosphor-icons/react/dist/ssr";
import type { PhonicsWordbuildConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { tilePhonemeText, withPhonemes } from "@/lib/audio/phonemes";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeech } from "../_shared/useSpeech";
import { schema, score, type PhonicsWordbuildResponse } from "./logic";

/** Split a target word into the tiles that spell it, greedily matching the
 *  longest available multi-letter tile first (so "sh"+"i"+"p", not s+h+i+p). */
function segmentWord(word: string, tiles: string[]): string[] {
  const byLengthDesc = [...new Set(tiles)].sort((a, b) => b.length - a.length);
  const segments: string[] = [];
  let i = 0;
  const lower = word.toLowerCase();
  while (i < lower.length) {
    const match = byLengthDesc.find((t) => lower.startsWith(t.toLowerCase(), i));
    if (!match) return [...lower.slice(i)]; // fall back to single chars for the remainder
    segments.push(match);
    i += match.length;
  }
  return segments;
}

function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function PhonicsWordbuildPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<PhonicsWordbuildConfig, PhonicsWordbuildResponse>) {
  const parsed = useMemo(() => schema.parse(config), [config]);
  const speech = useSpeech();
  const reduced = useReducedMotion();

  const [wordIndex, setWordIndex] = useState(0);
  const [built, setBuilt] = useState<string[]>([]);
  const [tries, setTries] = useState(1);
  const [wrong, setWrong] = useState(false);
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

  // Speak the instruction once when the activity opens.
  const spokenRef = useRef(false);
  useEffect(() => {
    if (spokenRef.current) return;
    spokenRef.current = true;
    speech.speak(parsed.instruction);
  }, [parsed.instruction, speech]);

  // Clear the retry timer on unmount so a mid-shake navigation can't set state
  // after the component is gone.
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

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
    if (wrong || isComplete) return;
    setBuilt((prev) => [...prev, tile]);
    // Silent letters (e.g. the magic-e) fill the slot but make no sound.
    if (parsed.silent?.includes(tile)) return;
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
      setWrong(true);
      setTries((t) => t + 1);
      speech.speak("So close. Let's try that one again.");
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setWrong(false);
        setBuilt([]);
      }, 900);
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
            tts={current.ipa ? withPhonemes(current.word, current.ipa) : undefined}
            label={`Say the word ${current.word}`}
          />
          <span className="text-sm text-ink-soft">Word {wordIndex + 1} of {parsed.words.length}</span>
        </div>
      </div>

      {/* Build slots */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2"
        animate={wrong && !reduced ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
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
            disabled={wrong}
            aria-label={`Letter tile ${tile}`}
            className={cn(
              "grid h-16 min-w-16 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised px-4",
              "font-display text-3xl text-ink shadow-pop transition duration-200 ease-out",
              "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-50",
            )}
          >
            {tile}
          </button>
        ))}
      </div>

      {/* Controls: undo / clear / done — forgiving, no scoring penalty */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="soft" size="md" onClick={undo} disabled={built.length === 0 || wrong}>
          <BackspaceIcon weight="bold" aria-hidden="true" />
          Undo
        </Button>
        <Button variant="soft" size="md" onClick={clearBuild} disabled={built.length === 0 || wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Start over
        </Button>
        <Button variant="primary" size="kid" onClick={check} disabled={!isComplete || wrong}>
          Check it
        </Button>
      </div>
    </div>
  );
}
