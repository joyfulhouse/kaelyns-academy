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
  /** Called only after the neural clip reaches its natural end. */
  onComplete?: () => void;
}

export interface NarrateHandle {
  cancel: () => void;
}

/**
 * Bounded LRU of normalized text → object URL synthesized this session. Caps
 * memory: each entry holds a blob URL, so an unbounded cache leaks for the whole
 * session. A `Map` preserves insertion order, so the first key is the
 * least-recently-used; we revoke its URL on eviction. Eviction only ever targets
 * the LRU entry, and `cacheGet` re-inserts (touches) an entry on read so the URL
 * we're about to play is the *most*-recently-used and can't be evicted out from
 * under playback.
 */
const MAX_ENTRIES = 64;
const memo = new Map<string, string>();
const normalize = (t: string): string => t.trim().replace(/\s+/g, " ");

/** Read a cached URL, marking it most-recently-used so it survives eviction. */
function cacheGet(key: string): string | undefined {
  const url = memo.get(key);
  if (url === undefined) return undefined;
  memo.delete(key);
  memo.set(key, url);
  return url;
}

/** Store a URL, evicting (and revoking) the least-recently-used entry if full. */
function cacheSet(key: string, url: string): void {
  // If this key was already cached (e.g. two concurrent misses for the same text
  // each minted a blob URL), revoke the superseded URL so it doesn't leak, and
  // re-insert so the entry re-counts as most-recently-used.
  const prior = memo.get(key);
  if (prior !== undefined) {
    if (prior !== url) URL.revokeObjectURL(prior);
    memo.delete(key);
  }
  memo.set(key, url);
  if (memo.size > MAX_ENTRIES) {
    const oldest = memo.entries().next().value;
    if (oldest) {
      const [oldestKey, evicted] = oldest;
      memo.delete(oldestKey);
      URL.revokeObjectURL(evicted);
    }
  }
}

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
    el.onended = () => {
      if (audio === el && !cancelled) {
        audio = null;
        options.onComplete?.();
      }
    };
    void el.play().catch(() => {
      if (audio === el && !cancelled) {
        audio = null;
        options.onUnavailable();
      }
    });
  };

  const cached = cacheGet(trimmed);
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
      cacheSet(trimmed, url);
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
