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

/**
 * Exposes the ambient read-aloud default directly, for a caller that must
 * branch on it itself (e.g. deciding whether to await an utterance before
 * continuing) rather than only gating an effect via {@link useSpeakOnce}.
 */
export function useReadAloudEnabled(): boolean {
  return useContext(ReadAloudDefaultContext);
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
 * Speak `text` once per `key`. The default key preserves once-on-mount behavior;
 * callers with distinct screen states can key each utterance separately. A null
 * text waits without latching, which lets hydration-sensitive callers defer
 * narration until browser state resolves.
 */
export function useSpeakOnce(
  speak: (text: string) => void,
  text: string | null,
  key: unknown = ONCE,
  options: { essentialContentAudio?: boolean } = {},
): void {
  const enabled = useContext(ReadAloudDefaultContext);
  const essentialContentAudio = options.essentialContentAudio ?? false;
  const spokenKey = useRef<unknown>(UNSEEN);
  useEffect(() => {
    if (
      !shouldRunOneShotEffect(enabled, essentialContentAudio) ||
      text === null ||
      spokenKey.current === key
    ) {
      return;
    }
    spokenKey.current = key;
    speak(text);
  }, [enabled, essentialContentAudio, key, speak, text]);
}
