"use client";

import { useCallback, useState } from "react";
import type { TargetAndTransition, Transition } from "motion/react";
import { useManagedTimeout } from "./useManagedTimeout";

/** The wrong-answer shake keyframes: a quick, decaying left-right wobble (DESIGN.md §4). */
const SHAKE_ANIM: TargetAndTransition = { x: [0, -8, 8, -6, 6, 0] };
/** Shared transition for the shake and its resting state. */
const SHAKE_TRANSITION: Transition = { duration: 0.4, ease: [0.25, 1, 0.5, 1] };

const REST: TargetAndTransition = { x: 0 };

export interface WrongShake {
  /** True while the shake / input-locked window is active. */
  wrong: boolean;
  /**
   * Enter the wrong state: optionally `speak` a gentle nudge now, then auto-clear
   * after `holdMs` (default 900ms), running `onClear` (e.g. resetting a build).
   */
  trigger: (opts?: { speak?: () => void; onClear?: () => void; holdMs?: number }) => void;
  /** Motion props for the shaken container; collapses to rest under reduced motion. */
  shakeProps: (reduced: boolean) => { animate: TargetAndTransition; transition: Transition };
}

/**
 * The forgiving wrong-answer shake shared by the math/phonics build Players: no
 * red X — the input wobbles, a gentle spoken nudge plays, and the state clears
 * itself after ~900ms (optionally resetting the build). The self-clear timer is
 * unmount-safe (see {@link useManagedTimeout}). Each call site passes its own
 * nudge copy, timing, and clear behavior.
 */
export function useWrongShake(): WrongShake {
  const [wrong, setWrong] = useState(false);
  const timer = useManagedTimeout();

  const trigger = useCallback<WrongShake["trigger"]>(
    (opts) => {
      setWrong(true);
      opts?.speak?.();
      timer.set(() => {
        setWrong(false);
        opts?.onClear?.();
      }, opts?.holdMs ?? 900);
    },
    [timer],
  );

  const shakeProps = useCallback<WrongShake["shakeProps"]>(
    (reduced) => ({
      animate: wrong && !reduced ? SHAKE_ANIM : REST,
      transition: SHAKE_TRANSITION,
    }),
    [wrong],
  );

  return { wrong, trigger, shakeProps };
}
