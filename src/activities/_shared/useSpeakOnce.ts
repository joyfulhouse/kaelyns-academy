"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

const UNSEEN = Symbol("unseen");
const ONCE = Symbol("once");
const ReadAloudDefaultContext = createContext(true);

/** Controls automatic narration while leaving every manual speaker available. */
export function ReadAloudDefaultProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return createElement(ReadAloudDefaultContext.Provider, { value: enabled }, children);
}

/**
 * Run `effect` on mount, then again only when `key` changes — the mount run
 * always happens (the initial key is treated as unseen). The audio Players use
 * this to auto-play a prompt exactly once per item, so a re-render (e.g. a choice
 * tap that re-voices the tapped choice) can't replay the prompt. Omit `key` for a
 * plain once-on-mount effect.
 */
export function shouldRunOneShotEffect(
  readAloudEnabled: boolean,
  essentialContentAudio: boolean,
): boolean {
  return readAloudEnabled || essentialContentAudio;
}

export function useEffectOncePerKey(
  effect: () => void,
  key: unknown = ONCE,
  options: { essentialContentAudio?: boolean } = {},
): void {
  const enabled = useContext(ReadAloudDefaultContext);
  const essentialContentAudio = options.essentialContentAudio ?? false;
  const seen = useRef<unknown>(UNSEEN);
  useEffect(() => {
    if (!shouldRunOneShotEffect(enabled, essentialContentAudio)) return;
    if (seen.current === key) return;
    seen.current = key;
    effect();
  }, [key, effect, enabled, essentialContentAudio]);
}

/**
 * Speak `text` once, on mount. Used by the Players that read their instruction
 * aloud the first time the screen appears. TTS is an enhancement (the prompt text
 * is always visible too), so a missing voice simply means nothing is spoken.
 */
export function useSpeakOnce(speak: (text: string) => void, text: string): void {
  const enabled = useContext(ReadAloudDefaultContext);
  const spoken = useRef(false);
  useEffect(() => {
    if (!enabled || spoken.current) return;
    spoken.current = true;
    speak(text);
  }, [enabled, speak, text]);
}
