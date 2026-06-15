"use client";

/**
 * Play English narration from the Kokoro-backed /api/tts route. Audio is an
 * enhancement: on ANY failure (no browser audio, route 4xx/5xx/503, network
 * error, decode/autoplay rejection) we invoke `onUnavailable()` so the caller can
 * speak via the browser Web Speech fallback. Returns a cancel handle.
 */
export type Persist = "durable" | "ephemeral";

export interface NarrateOptions {
  persist?: Persist;
  /** Called when the neural clip cannot be played; speak via browser TTS here. */
  onUnavailable: () => void;
}

export interface NarrateHandle {
  cancel: () => void;
}

/** Session memo: normalized text → object URL already synthesized this session. */
const memo = new Map<string, string>();
const normalize = (t: string): string => t.trim().replace(/\s+/g, " ");

export function narrate(text: string, options: NarrateOptions): NarrateHandle {
  const trimmed = normalize(text);
  if (!trimmed || typeof window === "undefined" || typeof Audio === "undefined") {
    options.onUnavailable();
    return { cancel: () => {} };
  }

  let audio: HTMLAudioElement | null = null;
  let cancelled = false;

  const play = (url: string): void => {
    if (cancelled) return;
    const el = new Audio(url);
    audio = el;
    el.onerror = () => {
      if (audio === el && !cancelled) {
        audio = null;
        options.onUnavailable();
      }
    };
    void el.play().catch(() => {
      if (audio === el && !cancelled) {
        audio = null;
        options.onUnavailable();
      }
    });
  };

  const cached = memo.get(trimmed);
  if (cached) {
    play(cached);
    return { cancel: () => stop() };
  }

  void (async () => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed, persist: options.persist ?? "durable" }),
      });
      if (!res.ok || cancelled) {
        if (!cancelled) options.onUnavailable();
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      memo.set(trimmed, url);
      play(url);
    } catch {
      if (!cancelled) options.onUnavailable();
    }
  })();

  function stop(): void {
    cancelled = true;
    if (audio) {
      audio.onerror = null;
      audio.onended = null;
      audio.pause();
      audio = null;
    }
  }

  return { cancel: stop };
}
