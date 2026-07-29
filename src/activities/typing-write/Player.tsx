"use client";

import { useEffect, useRef, useState } from "react";
import { EarIcon } from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import type { TypingWriteConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Mascot } from "@/components/art/Mascot";
import { StarShape } from "@/components/ui/Stars";
import { Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useTargetSpeech } from "../_shared/useTargetSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { BufferTiles, ExpectedTiles } from "../_shared/typing/WordTiles";
import {
  initialWordProgress,
  isWordComplete,
  pressWordBackspace,
  pressWordKey,
  wordKeyWillBeWrong,
  wordItemResult,
  type WordProgress,
} from "../_shared/typing/wordType";
import { schema, type TypingWriteResponse } from "./logic";

/** Retries within one word before the hidden target reveals itself (D7). */
const REVEAL_RETRIES = 2;

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

export function writeAnnouncement(
  item: string | null,
  hearMode: boolean,
  revealed: boolean,
): string {
  if (item === null) return "";
  return hearMode && !revealed ? "Listen, then type the word" : `Type ${item}`;
}

export function WriteRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingWriteConfig, TypingWriteResponse>) {
  const parsed = useActivity(schema, config);
  const items = parsed.items;
  const speech = useSpeech();
  const targetSpeech = useTargetSpeech(speech);
  const reducedMotion = useReducedMotion();
  const shake = useWrongShake();
  const [state, setState] = useState(initialWriteState);
  const reported = useRef(false);
  const targetSpeechIndexRef = useRef(state.index);
  // A monotonic clock read only from the event path (the useTypingKeys
  // handler below), never during render — react-hooks/purity forbids calling
  // performance.now() while rendering.
  const elapsedStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetSpeechIndexRef.current === state.index) return;
    targetSpeechIndexRef.current = state.index;
    targetSpeech.reset();
  }, [state.index, targetSpeech]);

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
    { essentialContentAudio: true },
  );

  useTypingKeys((intent) => {
    if (intent.type === "backspace") {
      setState((current) => ({ ...current, progress: pressWordBackspace(current.progress) }));
      return;
    }
    if (intent.type !== "char") return;
    if (item !== null && wordKeyWillBeWrong(state.progress, item, intent)) {
      shake.trigger();
    }
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
          <motion.div
            key={shake.sequence}
            data-typing-buffer="true"
            {...shake.shakeProps(reducedMotion)}
          >
            <BufferTiles item={item} progress={state.progress} />
          </motion.div>
        </div>
      )}

      <p aria-live="polite" className="min-h-7 text-center font-display text-lg text-ink">
        {state.progress.diverged
          ? "Press Backspace to fix it"
          : writeAnnouncement(item, hearMode, revealed)}
      </p>

      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="flex flex-wrap items-center justify-center gap-1.5">
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
