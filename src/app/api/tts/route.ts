// src/app/api/tts/route.ts
/**
 * On-demand English narration. Hash the text; if a clip is already cached, 303 to
 * the immutable `/audio` URL (browser-cacheable). On a miss, synthesize via Kokoro,
 * write-through to MinIO (best-effort), and stream the mp3 back so first play works
 * even without durable storage. Kokoro unreachable → 503 so the client falls back
 * to browser TTS. Build-safe: all env/network is per-request.
 */
import { NextResponse } from "next/server";
import {
  MAX_TTS_TEXT_LEN,
  type Persist,
  clipObjectPath,
  clipPublicUrl,
  enSpeed,
  enVoice,
  prefixFor,
} from "@/lib/audio/config";
import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { normalizeText, ttsKey } from "@/lib/audio/ttsKey";
import { clipExists, putClip } from "@/lib/audio/store";
import { captureNonCritical } from "@/lib/capture";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { getAccountOrNull } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

/** Each synth is a ~30s Kokoro call + a MinIO write, so this route is throttled.
 *  The public "explore" learner flow is unauthenticated, so anonymous callers are
 *  allowed but keyed (and capped tighter) by client IP — a best-effort,
 *  per-instance denial-of-wallet control (a determined attacker rotating IPs can
 *  still spend; a cluster-wide cap would need a shared store). Signed-in accounts
 *  get a more generous per-account window. On-demand writes are ephemeral-only
 *  (below), so anonymous text never reaches the durable cache. */
const RATE_LIMIT_ACCOUNT = { limit: 60, windowMs: 60_000 };
const RATE_LIMIT_ANON = { limit: 20, windowMs: 60_000 };

/** Dedupe concurrent identical synths within a process so a burst → one Kokoro call. */
const inflight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

interface Body {
  text?: unknown;
  voice?: unknown;
  persist?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  // Rate limit BEFORE any synth or MinIO work. Anonymous callers (public explore
  // flow) are allowed but keyed + capped by client IP; signed-in accounts get a
  // generous per-account window.
  const account = await getAccountOrNull();
  const { limitKey, policy } = account
    ? { limitKey: `tts:acct:${account.accountId}`, policy: RATE_LIMIT_ACCOUNT }
    : { limitKey: `tts:ip:${clientIp(req.headers) ?? "noip"}`, policy: RATE_LIMIT_ANON };

  const limit = checkRateLimit(limitKey, policy);
  if (!limit.ok) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  // Best-effort request-size guard BEFORE buffering the body: a TTS payload is a
  // short child-facing string, so a large content-length is abuse. Absent/chunked
  // length → skip (can't cheaply know the size up front).
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 16384) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // A literal `null` (or any non-object) JSON body parses without throwing, but
  // would throw on field access below — treat it as a bad request, not a 500.
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // Canonicalize the same way ttsKey hashes so the synth input, cache key, and
  // length check all agree (a whitespace-padded body can't bypass the cap).
  const text = typeof body.text === "string" ? normalizeText(body.text) : "";
  // Empty/whitespace-only or over-long text is nothing to synthesize → a clear,
  // JSON 400 (matching the api/practice error-response style) so callers can act
  // on it rather than parse an empty body.
  if (!text || text.length > MAX_TTS_TEXT_LEN) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  const requestedVoice = typeof body.voice === "string" && body.voice ? body.voice : enVoice();
  // Defense-in-depth: a voice id is a short identifier token. Anything outside the
  // safe charset (e.g. control chars) is rejected back to the default — we do NOT
  // enumerate valid voice ids here (Kokoro owns that), just strip obvious abuse.
  const voice = /^[A-Za-z0-9_]{1,40}$/.test(requestedVoice) ? requestedVoice : enVoice();
  const speed = enSpeed();
  // On-demand synth always writes to the EPHEMERAL (auto-expiring) tier: the
  // durable tier is owned solely by the warm-pass / pre-synth path
  // (`ensureNarration` → `putClip`), which never goes through this route. This
  // keeps arbitrary request text out of the permanent cache without touching the
  // warm-pass. (We accept the field for back-compat but no longer honor "durable".)
  const persist: Persist = "ephemeral";
  const prefix = prefixFor(persist);
  const key = ttsKey(text, voice, speed);

  // Hit (check the target tier; ephemeral also accepts a durable copy).
  if (await clipExists(prefix, key)) return redirect(prefix, key);
  if (await clipExists("en", key)) return redirect("en", key);

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
