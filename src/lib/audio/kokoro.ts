// src/lib/audio/kokoro.ts
/** Thin client for the homelab kokoro-fastapi OpenAI-compatible TTS endpoint. */
import { getEnv } from "@/lib/env";

const SYNTH_TIMEOUT_MS = 30_000;

/** Synthesize `text` to mp3 bytes. Throws on unreachable/timeout/non-OK. */
export async function synthesizeMp3(
  text: string,
  voice: string,
  speed: number,
): Promise<Uint8Array> {
  const base = getEnv("KOKORO_URL", "http://localhost:8880/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: text,
      voice,
      response_format: "mp3",
      speed,
    }),
    signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`kokoro ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
