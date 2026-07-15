"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon, BackspaceIcon } from "@phosphor-icons/react/dist/ssr";
import type { PhonicsWordbuildConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { tilePhonemeText, wordPhonemeText } from "@/lib/audio/phonemes";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { shuffle } from "../_shared/shuffle";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import {
  addTileToBuild,
  constructedText,
  createTileInventory,
  findExactSegmentation,
  MAX_PHONICS_ATTEMPTS,
  releaseTileFromBuild,
  startPhonemeSweep,
} from "./model";
import { schema, type PhonicsWordbuildResponse } from "./logic";

export function PhonicsWordbuildPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<PhonicsWordbuildConfig, PhonicsWordbuildResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [wordIndex, setWordIndex] = useState(0);
  const [builtTileIndices, setBuiltTileIndices] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(1);
  const [usedHelp, setUsedHelp] = useState(false);
  const [builds, setBuilds] = useState<PhonicsWordbuildResponse["builds"]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeTileIndex, setActiveTileIndex] = useState<number | null>(null);
  const [sweepLabel, setSweepLabel] = useState<string | null>(null);
  const [blendLabel, setBlendLabel] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const trayButtonRefs = useRef(new Map<number, HTMLButtonElement>());
  const cancelSweepRef = useRef<(() => void) | null>(null);

  const current = parsed.words[wordIndex];
  const targetTileIndices = useMemo(
    () => (current ? findExactSegmentation(current.word, parsed.tiles) ?? [] : []),
    [current, parsed.tiles],
  );
  const inventory = useMemo(() => createTileInventory(parsed.tiles), [parsed.tiles]);
  const tray = useMemo(
    () => shuffle(inventory, parsed.tiles.join("").length + wordIndex * 7),
    [inventory, parsed.tiles, wordIndex],
  );
  const builtText = constructedText(builtTileIndices, parsed.tiles);

  useSpeakOnce(speech.speak, parsed.instruction);
  useEffect(
    () => () => {
      cancelSweepRef.current?.();
    },
    [],
  );

  if (!current) return null;

  const isComplete = builtTileIndices.length === targetTileIndices.length;

  function copyLabel(tileIndex: number): string {
    const tile = parsed.tiles[tileIndex];
    const total = parsed.tiles.filter((candidate) => candidate === tile).length;
    if (total === 1) return `Use tile ${tile}`;
    const copy = parsed.tiles.slice(0, tileIndex + 1).filter((candidate) => candidate === tile).length;
    return `Use tile ${tile}, copy ${copy} of ${total}`;
  }

  function focusTrayTile(tileIndex: number): void {
    window.requestAnimationFrame(() => trayButtonRefs.current.get(tileIndex)?.focus());
  }

  function placeTile(tileIndex: number): void {
    if (shake.wrong || sweeping || isComplete || builtTileIndices.includes(tileIndex)) return;
    const tile = parsed.tiles[tileIndex];
    if (tile === undefined) return;
    setBuiltTileIndices((previous) =>
      addTileToBuild(previous, tileIndex, parsed.tiles.length),
    );
    setFeedback(null);
    if (parsed.silent?.includes(tile)) {
      speech.cancel();
    } else {
      const tts = tilePhonemeText(tile, parsed.say);
      speech.speak(tile, tts ? { tts } : undefined);
    }
  }

  function removeTile(tileIndex: number): void {
    if (shake.wrong || sweeping) return;
    setBuiltTileIndices((previous) => releaseTileFromBuild(previous, tileIndex));
    setFeedback(null);
    focusTrayTile(tileIndex);
  }

  function undo(): void {
    const tileIndex = builtTileIndices.at(-1);
    if (tileIndex === undefined) return;
    removeTile(tileIndex);
  }

  function clearBuild(): void {
    if (shake.wrong || sweeping) return;
    const firstTileIndex = builtTileIndices[0];
    setBuiltTileIndices([]);
    setFeedback(null);
    if (firstTileIndex !== undefined) focusTrayTile(firstTileIndex);
  }

  function finishWord(responseBuild: PhonicsWordbuildResponse["builds"][number]): void {
    const nextBuilds = [...builds, responseBuild];
    setBuilds(nextBuilds);
    const isLast = wordIndex === parsed.words.length - 1;
    if (isLast) {
      onComplete({ builds: nextBuilds });
      return;
    }
    setWordIndex((index) => index + 1);
    setBuiltTileIndices([]);
    setAttempts(1);
    setUsedHelp(false);
    setFeedback(null);
    setSweepLabel(null);
    setBlendLabel(null);
  }

  function check(): void {
    const correct = builtText.toLocaleLowerCase() === current.word.toLocaleLowerCase();
    if (!correct) {
      setAttempts((value) => Math.min(MAX_PHONICS_ATTEMPTS, value + 1));
      setFeedback("Keep your tiles and try a different order.");
      shake.trigger({
        speak: () => speech.speak("Keep your tiles and try a different order."),
        holdMs: 600,
      });
      return;
    }

    setSweeping(true);
    setFeedback("You built it. Listen to the sounds, then the whole word.");
    const responseBuild = { wordIndex, tileIndices: builtTileIndices, attempts, usedHelp };
    cancelSweepRef.current = startPhonemeSweep({
      tileIndices: builtTileIndices,
      tiles: parsed.tiles,
      silent: parsed.silent,
      onActiveTile: (tileIndex) => {
        setActiveTileIndex(tileIndex);
        if (tileIndex === null) setSweepLabel(null);
      },
      onSpeakTile: (tile) => {
        setSweepLabel(tile);
        const tts = tilePhonemeText(tile, parsed.say);
        speech.speak(tile, tts ? { tts } : undefined);
      },
      onSpeakWord: () => {
        setBlendLabel(current.word);
        speech.speak(
          current.word,
          current.ipa ? { tts: wordPhonemeText(current.word, current.ipa) } : undefined,
        );
      },
      onDone: () => {
        cancelSweepRef.current = null;
        setSweeping(false);
        finishWord(responseBuild);
      },
      dwellMs: reduced ? 500 : 700,
    });
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <div className="flex flex-col items-center gap-3">
        {current.picture && (
          <motion.div
            key={current.word}
            className="grid size-36 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised shadow-pop"
            initial={reduced ? { opacity: 1 } : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              className="text-7xl"
              role="img"
              aria-label="Picture clue for the target word"
            >
              {current.picture}
            </span>
          </motion.div>
        )}
        <div className="flex items-center gap-2">
          <SpeakerButton
            speech={speech}
            text={current.word}
            tts={wordPhonemeText(current.word, current.ipa)}
            label="Hear the target word"
          />
          <span className="text-sm text-ink-soft">
            Word {wordIndex + 1} of {parsed.words.length}
          </span>
        </div>
        {(!speech.supported || speech.lastOutcome === "unavailable") && !usedHelp ? (
          <p role="status" className="max-w-md text-center text-sm text-ink-soft">
            Audio isn’t available here. Show the target word to keep going.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setUsedHelp(true)}
          aria-pressed={usedHelp}
          disabled={usedHelp}
          className="min-h-11 rounded-full border-2 border-ink bg-honey/20 px-5 py-2 font-display text-ink transition active:translate-y-0.5 disabled:cursor-default disabled:bg-paper-raised"
        >
          {usedHelp ? "Target word shown" : "Show the target word"}
        </button>
        {usedHelp ? (
          <p className="font-display text-4xl text-ink" aria-live="polite">
            Word to build: {current.word}
          </p>
        ) : null}
      </div>

      <motion.div
        role="group"
        aria-label={`Built word ${builtText || "empty"}`}
        className="flex flex-wrap items-center justify-center gap-2"
        {...shake.shakeProps(reduced)}
      >
        {targetTileIndices.map((_, slot) => {
          const tileIndex = builtTileIndices[slot];
          const tile = tileIndex === undefined ? undefined : parsed.tiles[tileIndex];
          return tileIndex === undefined || tile === undefined ? (
            <span
              key={`empty-${slot}`}
              aria-label={`Empty sound slot ${slot + 1}`}
              className="grid h-16 min-w-16 place-items-center rounded-xl border-[3px] border-dashed border-ink/30 bg-paper-sunk px-3 font-display text-3xl text-ink/30"
            />
          ) : (
            <button
              key={tileIndex}
              type="button"
              onClick={() => removeTile(tileIndex)}
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault();
                  removeTile(tileIndex);
                }
              }}
              disabled={sweeping || shake.wrong}
              aria-label={`Placed tile ${tile} in slot ${slot + 1}. Activate to return it`}
              className={cn(
                "grid h-16 min-w-16 place-items-center rounded-xl border-[3px] border-ink px-3 font-display text-3xl text-ink shadow-pop",
                activeTileIndex === tileIndex ? "bg-success ring-4 ring-success/30" : "bg-honey",
                reduced ? "" : "transition-colors duration-150",
              )}
            >
              {tile}
            </button>
          );
        })}
      </motion.div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {tray.map((tile) => {
          const used = builtTileIndices.includes(tile.index);
          return (
            <button
              key={tile.index}
              ref={(element) => {
                if (element) trayButtonRefs.current.set(tile.index, element);
                else trayButtonRefs.current.delete(tile.index);
              }}
              type="button"
              onClick={() => placeTile(tile.index)}
              disabled={used || shake.wrong || sweeping || isComplete}
              aria-label={copyLabel(tile.index)}
              className={cn(
                "grid h-20 min-w-20 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised px-4",
                "font-display text-3xl text-ink shadow-pop transition duration-200 ease-out",
                "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-35",
              )}
            >
              {tile.text}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" aria-atomic="true" className="min-h-7 text-center">
        {sweepLabel ? (
          <p className="font-display text-lg text-ink">Sound sweep: {sweepLabel}</p>
        ) : blendLabel ? (
          <p className="font-display text-lg text-success">Blending the whole word: {blendLabel}</p>
        ) : feedback ? (
          <p className="font-display text-lg text-ink">{feedback}</p>
        ) : null}
      </div>

      <PlayerControls>
        <Button
          variant="soft"
          size="md"
          onClick={undo}
          disabled={builtTileIndices.length === 0 || shake.wrong || sweeping}
        >
          <BackspaceIcon weight="bold" aria-hidden="true" />
          Undo
        </Button>
        <Button
          variant="soft"
          size="md"
          onClick={clearBuild}
          disabled={builtTileIndices.length === 0 || shake.wrong || sweeping}
        >
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Start over
        </Button>
        <Button
          variant="primary"
          size="kid"
          onClick={check}
          disabled={!isComplete || shake.wrong || sweeping}
        >
          Check it
        </Button>
      </PlayerControls>
    </div>
  );
}
