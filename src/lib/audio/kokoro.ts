// src/lib/audio/kokoro.ts
/** Thin client for the homelab kokoro-fastapi OpenAI-compatible TTS endpoint.
 *  Also home to the two tiny network helpers shared across the audio clients
 *  (kokoroBase, timedFetch) — colocated here, the lowest-level audio client, so
 *  phonemize.ts and store.ts can reuse the exact same base-URL trim + timeout
 *  posture without a separate util module. */
import { getEnv } from "@/lib/env";

const SYNTH_TIMEOUT_MS = 30_000;

/** The Kokoro OpenAI-compatible base URL (KOKORO_URL, default localhost) with any
 *  trailing slash trimmed, so a caller can append a clean `/audio/speech` — or
 *  strip the `/v1` suffix to reach the server-root dev endpoints (phonemize.ts). */
export function kokoroBase(): string {
  return getEnv("KOKORO_URL", "http://localhost:8880/v1").replace(/\/$/, "");
}

/** `fetch` bounded by `AbortSignal.timeout(ms)` so a hung Kokoro/MinIO upstream
 *  aborts after `ms` instead of hanging the caller. The timeout signal is the only
 *  thing added; the request otherwise behaves exactly like the bare `fetch` each
 *  caller used before. Each caller passes its own budget (synth/phonemize/HEAD). */
export function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/** Synthesize `text` to mp3 bytes. Throws on unreachable/timeout/non-OK.
 *  Returns an `ArrayBuffer`-backed view (not `ArrayBufferLike`) so the bytes are a
 *  valid `BodyInit` for `new Response(...)` under TS's strict typed-array generics. */
export async function synthesizeMp3(
  text: string,
  voice: string,
  speed: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await timedFetch(
    `${kokoroBase()}/audio/speech`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: text,
        voice,
        response_format: "mp3",
        speed,
      }),
    },
    SYNTH_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`kokoro ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
