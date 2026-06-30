"use client";

import { useCallback, useState } from "react";
import { useManagedTimeout } from "./useManagedTimeout";

export interface MultipleChoice {
  /** Current item index (0-based). */
  step: number;
  /** The choice the child tapped for this item, or null before they pick. */
  picked: number | null;
  /** Record a tap: voices the choice, reveals briefly, then advances or finishes. */
  choose: (choiceIndex: number) => void;
}

/**
 * The reveal-then-advance quiz loop shared by the audio Players (lang-listen-match,
 * lang-symbol-intro): tap a choice → it locks and is voiced → after `advanceMs`
 * (650ms) either advance to the next item or finish with the full answer list.
 * The advance timer is unmount-safe (see {@link useManagedTimeout}).
 */
export function useMultipleChoice(opts: {
  count: number;
  /** Voice the tapped choice. `itemIndex` is the current step, so callers never
   *  need to reference this hook's returned `step` inside their own setup. */
  voiceChoice: (choiceIndex: number, itemIndex: number) => void;
  onFinish: (answers: number[]) => void;
  advanceMs?: number;
}): MultipleChoice {
  const { count, voiceChoice, onFinish, advanceMs = 650 } = opts;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useManagedTimeout();

  const choose = useCallback(
    (choiceIndex: number) => {
      if (picked !== null) return;
      setPicked(choiceIndex);
      const nextAnswers = [...answers, choiceIndex];
      voiceChoice(choiceIndex, step);
      timer.set(() => {
        if (step + 1 >= count) {
          onFinish(nextAnswers);
        } else {
          setAnswers(nextAnswers);
          setStep(step + 1);
          setPicked(null);
        }
      }, advanceMs);
    },
    [picked, answers, step, count, voiceChoice, onFinish, advanceMs, timer],
  );

  return { step, picked, choose };
}
