// src/app/api/tts/route.ts
/**
 * On-demand English narration. Hash the text; if a clip is already cached, 303 to
 * the immutable `/audio` URL (browser-cacheable). On a miss, synthesize via Kokoro,
 * write-through to MinIO (best-effort), and stream the mp3 back so first play works
 * even without durable storage. Kokoro unreachable → 503 so the client falls back
 * to browser TTS. Build-safe: all env/network is per-request.
 */
import { type Persist, clipObjectPath, clipPublicUrl, enSpeed, enVoice, prefixFor } from "@/lib/audio/config";
import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { ttsKey } from "@/lib/audio/ttsKey";
import { clipExists, putClip } from "@/lib/audio/store";
import { captureNonCritical } from "@/lib/capture";

export const dynamic = "force-dynamic";

/** Dedupe concurrent identical synths within a process so a burst → one Kokoro call. */
const inflight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

interface Body {
  text?: unknown;
  voice?: unknown;
  persist?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return new Response(null, { status: 400 });

  const voice = typeof body.voice === "string" && body.voice ? body.voice : enVoice();
  const speed = enSpeed();
  const persist: Persist = body.persist === "ephemeral" ? "ephemeral" : "durable";
  const prefix = prefixFor(persist);
  const key = ttsKey(text, voice, speed);

  // Hit (check the target tier; ephemeral also accepts a durable copy).
  if (await clipExists(prefix, key)) return redirect(prefix, key);
  if (persist === "ephemeral" && (await clipExists("en", key))) return redirect("en", key);

  // Miss: synthesize (deduped), write-through, stream.
  try {
    let promise = inflight.get(key);
    if (!promise) {
      promise = synthesizeMp3(text, voice, speed);
      inflight.set(key, promise);
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await promise;
    } finally {
      inflight.delete(key);
    }
    void putClip(prefix, key, bytes); // best-effort; do not block playback
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch (err) {
    captureNonCritical(`/api/tts synth failed for ${clipObjectPath(prefix, key)}`, err);
    return new Response(null, { status: 503 });
  }
}

function redirect(prefix: string, key: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: clipPublicUrl(prefix, key) },
  });
}
