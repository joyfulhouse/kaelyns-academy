// src/lib/audio/config.ts
/**
 * Static config + addressing for English neural narration clips. No I/O here —
 * env is read per call (never at module load) so this is safe to import anywhere.
 */
import { getEnv } from "@/lib/env";

export type Persist = "durable" | "ephemeral";

/** Permanent tier: static UI + pre-synth-on-generation. */
export const DURABLE_PREFIX = "en";
/** Auto-expiring tier (MinIO lifecycle): one-off dynamic speech. */
export const EPHEMERAL_PREFIX = "en/cache";

/** Max characters synthesized in one TTS call. Shared by the on-demand `/api/tts`
 *  route AND the warm/pre-synth path (`ensureNarration`) so neither pays for — or
 *  durably caches — oversized text (a child-facing string is short; longer is
 *  abuse or AI noise). Keeping both in sync prevents a denial-of-wallet gap where
 *  pre-synth would synthesize text the runtime route would reject anyway. */
export const MAX_TTS_TEXT_LEN = 500;

export function prefixFor(persist: Persist | undefined): string {
  return persist === "ephemeral" ? EPHEMERAL_PREFIX : DURABLE_PREFIX;
}

/** Object key within the bucket, e.g. `en/<key>.mp3`. */
export function clipObjectPath(prefix: string, key: string): string {
  return `${prefix}/${key}.mp3`;
}

function audioBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_AUDIO_BASE_URL : undefined;
  return fromEnv && fromEnv.trim() ? fromEnv.trim().replace(/\/$/, "") : "/audio";
}

/** Same-origin (or CDN) URL the browser plays, served by the `/audio` proxy. */
export function clipPublicUrl(prefix: string, key: string): string {
  return `${audioBaseUrl()}/${clipObjectPath(prefix, key)}`;
}

/** Kokoro English voice (default warm US female). */
export function enVoice(): string {
  return getEnv("KOKORO_EN_VOICE", "af_heart");
}

/** Kokoro speaking rate — a touch slow for young ears. */
export function enSpeed(): number {
  const raw = getEnv("KOKORO_EN_SPEED", "0.9");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0.9;
}
