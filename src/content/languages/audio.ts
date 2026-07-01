/**
 * Hybrid audio key/URL scheme.
 *
 * Canonical symbols and core vocab each have a stable `audioKey` (= `ScriptEntry.id`).
 * A pre-generated clip lives at `{AUDIO_BASE_URL}/{locale}/{audioKey}.{ext}`; the
 * audio layer plays that clip when it exists, else falls back to locale-aware
 * browser TTS of the entry's `spoken` text.
 *
 * `AUDIO_BASE_URL` is env-configured (`NEXT_PUBLIC_AUDIO_BASE_URL`, defaulting to
 * the app-local `/audio`) so the storage backend — object store, NFS PV, or a
 * static dir — is a deploy-time choice, not a code dependency.
 */

const DEFAULT_BASE = "/audio";
const CLIP_EXT = "m4a";

/** Client-safe base URL for audio clips (NEXT_PUBLIC_ so it inlines on the client). */
function audioBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_AUDIO_BASE_URL : undefined;
  return fromEnv && fromEnv.trim() ? fromEnv.trim().replace(/\/$/, "") : DEFAULT_BASE;
}

/** Deterministic URL for a pre-generated clip of `audioKey` in `locale`. */
export function audioClipUrl(locale: string, audioKey: string): string {
  return `${audioBaseUrl()}/${encodeURIComponent(locale)}/${encodeURIComponent(audioKey)}.${CLIP_EXT}`;
}
