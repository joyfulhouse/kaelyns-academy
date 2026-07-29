"use client";

import { useEffect, useRef, useState } from "react";
import { EarIcon } from "@phosphor-icons/react/dist/ssr";
import type { TypingWriteConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Mascot } from "@/components/art/Mascot";
import { StarShape } from "@/components/ui/Stars";
import { cn } from "@/lib/cn";
import { Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useTargetSpeech } from "../_shared/useTargetSpeech";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import {
  initialWordProgress,
  isWordComplete,
  pressWordBackspace,
  pressWordKey,
  wordItemResult,
  type WordProgress,
} from "../_shared/typing/wordType";
import { schema, type TypingWriteResponse } from "./logic";

/** Retries within one word before the hidden target reveals itself (D7). */
const REVEAL_RETRIES = 2;

const TILE_BASE =
  "grid size-14 place-items-center rounded-xl border-[3px] border-ink font-display text-2xl text-ink shadow-pop";
const TILE_TONE: Record<"correct" | "wrong", string> = {
  correct: "bg-honey",
  wrong: "bg-coral/55",
};

export function TypingWritePlayer(
  props: ActivityPlayerProps<TypingWriteConfig, TypingWriteResponse>,
) {
  return (
    <TypingStage onExit={props.onExit}>
      <WriteRound {...props} />
    </TypingStage>
  );
}

interface WriteState {
  index: number;
  progress: WordProgress;
  results: TypingWriteResponse["items"];
}

function initialWriteState(): WriteState {
  return { index: 0, progress: initialWordProgress(), results: [] };
}

function glyph(char: string): string {
  return char === " " ? "␣" : char;
}

/** The (always visible) target — hidden entirely in Player render; only shown
 *  in "see" mode or once a hear-mode round reveals. Decorative: the essential
 *  text lives in the aria-live announcement below. */
export function ExpectedTiles({ item }: { item: string }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap justify-center gap-2">
      {[...item].map((ch, i) => (
        <span key={i} className={cn(TILE_BASE, "bg-paper-raised")}>
          {glyph(ch)}
        </span>
      ))}
    </div>
  );
}

/**
 * §8: `progress.typed` is client-only display feedback. Only `wordItemResult`
 * (expected-derived data) is ever reported — this row is decorative, never the
 * source of what gets sent to `onComplete`.
 */
export function BufferTiles({ progress }: { progress: WordProgress }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap justify-center gap-2">
      {progress.typed.map((entry, i) => (
        <span key={i} className={cn(TILE_BASE, TILE_TONE[entry.ok ? "correct" : "wrong"])}>
          {glyph(entry.char)}
        </span>
      ))}
      <span className="grid size-14 place-items-center rounded-xl border-[3px] border-dashed border-ink/40 bg-paper-sunk text-2xl text-ink/40">
        |
      </span>
    </div>
  );
}

export function writeAnnouncement(item: string | null, hearMode: boolean): string {
  if (item === null) return "";
  return hearMode ? "Listen, then type the word" : `Type ${item}`;
}

export function WriteRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingWriteConfig, TypingWriteResponse>) {
  const parsed = useActivity(schema, config);
  const items = parsed.items;
  const speech = useSpeech();
  const targetSpeech = useTargetSpeech(speech);
  const [state, setState] = useState(initialWriteState);
  const reported = useRef(false);
  // A monotonic clock read only from the event path (the useTypingKeys
  // handler below), never during render — react-hooks/purity forbids calling
  // performance.now() while rendering.
  const elapsedStartRef = useRef<number | null>(null);

  const finished = state.index >= items.length;
  const item = finished ? null : (items[state.index] ?? null);
  const hearMode = parsed.mode === "hear";
  const audioUnavailable = !speech.supported || targetSpeech.unavailable;
  const revealed = !hearMode || state.progress.retries >= REVEAL_RETRIES || audioUnavailable;

  useSpeakOnce(speech.speak, parsed.instruction);

  // A NEW utterance per item: keyed on the index, not the item text, so a
  // repeated word later in the list still speaks again.
  useSpeakOnce(
    (text) => {
      void targetSpeech.speakTarget(text);
    },
    hearMode && item !== null ? item : null,
    state.index,
  );

  useTypingKeys((intent) => {
    if (intent.type === "backspace") {
      setState((current) => ({ ...current, progress: pressWordBackspace(current.progress) }));
      return;
    }
    if (intent.type !== "char") return;
    const nowMs = performance.now();
    if (elapsedStartRef.current === null) elapsedStartRef.current = nowMs;
    // Rounded: the response schema's `ms` is an integer, and performance.now()
    // has sub-millisecond precision.
    const now = Math.round(nowMs - elapsedStartRef.current);
    setState((current) => {
      const currentItem = items[current.index];
      if (currentItem === undefined) return current;
      const nextProgress = pressWordKey(current.progress, currentItem, intent, now);
      if (!isWordComplete(nextProgress)) {
        return { ...current, progress: nextProgress };
      }
      return {
        index: current.index + 1,
        progress: initialWordProgress(),
        results: [...current.results, wordItemResult(nextProgress, current.index)],
      };
    });
  }, !finished);

  // Completion is reported after React commits the final transition (mirrors
  // Key Camp): the ref guards against reporting twice under StrictMode.
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onComplete({ items: state.results });
  }, [finished, onComplete, state.results]);

  // Leaving the round mid-word must not leave a hear-mode utterance talking
  // to an empty screen.
  useEffect(() => {
    return () => {
      speech.cancel();
    };
  }, [speech]);

  return (
    <div className="flex flex-col items-center gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {item === null ? (
        <Mascot mood="cheer" size={96} title="Word Write complete" />
      ) : (
        <div className="flex flex-col items-center gap-4">
          {hearMode ? (
            <>
              {revealed ? (
                <ExpectedTiles item={item} />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-20 place-items-center rounded-full border-[3px] border-ink bg-honey shadow-pop"
                >
                  <EarIcon size={40} weight="bold" />
                </span>
              )}
              {audioUnavailable ? (
                <p role="status" className="max-w-md text-sm text-ink-soft">
                  Audio isn’t available here. The word is shown so you can keep going.
                </p>
              ) : (
                <SpeakerButton
                  onSpeak={() => {
                    void targetSpeech.speakTarget(item);
                  }}
                  label="Hear the word again"
                />
              )}
            </>
          ) : (
            <ExpectedTiles item={item} />
          )}
          <BufferTiles progress={state.progress} />
        </div>
      )}

      <p aria-live="polite" className="min-h-7 text-center font-display text-lg text-ink">
        {writeAnnouncement(item, hearMode)}
      </p>

      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="flex items-center gap-1.5">
          {items.map((_, i) => (
            <StarShape key={i} size={40} filled={i < state.index} emptyClassName="text-ink-soft" />
          ))}
        </span>
        <ProgressHint>
          {Math.min(state.index + 1, items.length)} of {items.length}
        </ProgressHint>
      </div>
    </div>
  );
}
