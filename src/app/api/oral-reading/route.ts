import { NextResponse } from "next/server";
import { z } from "zod";
import { matchOralReading, type OralReadingMatchResult } from "@/lib/ai/oralReadingMatch";
import { transcribeOralReading } from "@/lib/ai/transcribe";
import { resolveRateLimit } from "@/lib/api/rate";
import { captureNonCritical } from "@/lib/capture";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT_ACCOUNT = { limit: 30, windowMs: 60_000 };
const RATE_LIMIT_ANON = { limit: 10, windowMs: 60_000 };
// A recording is ≤8s and ~100-300KB; a body still trickling in after this
// long is a stalled or adversarial upload holding buffers open.
const BODY_READ_DEADLINE_MS = 15_000;
// Per-replica ceiling on concurrently buffering uploads: the per-account rate
// limit bounds request STARTS, not how many slow bodies are held open at once.
const MAX_CONCURRENT_READS = 8;

let activeReads = 0;

const fieldsSchema = z.object({
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  target: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => value.split(/\s+/).length <= 6),
});

type RouteResult = OralReadingMatchResult | "unavailable";

function result(resultValue: RouteResult, status = 200, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ result: resultValue }, { status, headers });
}

function declaredTooLarge(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}

/**
 * Buffer the request body while enforcing the byte cap DURING the read.
 * Content-Length is optional and forgeable, and `request.formData()` would
 * buffer the entire (unbounded) body before any size check could run — so a
 * chunked or dishonestly-declared oversized upload is cut off mid-stream here
 * instead of exhausting the replica's memory.
 */
async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<
  { status: "ok"; body: Uint8Array<ArrayBuffer> } | { status: "empty" | "too-large" | "busy" }
> {
  const reader = request.body?.getReader();
  if (!reader) return { status: "empty" };
  if (activeReads >= MAX_CONCURRENT_READS) {
    await reader.cancel();
    return { status: "busy" };
  }
  activeReads += 1;
  // A stalled sender never resolves reader.read(), so cancel on a deadline —
  // the pending read then resolves done and the truncated body fails multipart
  // parsing downstream (a 400), releasing the buffers either way.
  const deadline = setTimeout(() => void reader.cancel(), BODY_READ_DEADLINE_MS);
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        // A mid-upload disconnect (closed lid, dropped Wi-Fi, client abort)
        // rejects the read — that's a routine truncated body, not a crash.
        return { status: "empty" };
      }
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { status: "too-large" };
      }
      chunks.push(chunk.value);
    }
    if (total === 0) return { status: "empty" };
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: "ok", body };
  } finally {
    clearTimeout(deadline);
    activeReads -= 1;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // Resolve account identity only to choose the rate-limit bucket, matching TTS.
  // No body parsing, DB reads, or gateway work happens before this throttle.
  const account = await getAccountOrNull();
  const { key, policy } = resolveRateLimit(account, request, "oral-reading", {
    account: RATE_LIMIT_ACCOUNT,
    anon: RATE_LIMIT_ANON,
  });
  const limit = checkRateLimit(key, policy);
  if (!limit.ok) {
    return result("unavailable", 429, { "Retry-After": String(limit.retryAfterSec) });
  }

  // Reject a declared oversized multipart request before buffering it.
  if (declaredTooLarge(request)) return result("unavailable", 413);

  // Microphone verification is account-only. Guests never cause the multipart
  // body to be buffered and use the Player's grown-up fallback instead.
  if (!account) return result("unavailable", 403);

  const bounded = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bounded.status !== "ok") {
    if (bounded.status === "busy") return result("unavailable", 503, { "Retry-After": "5" });
    return result("unavailable", bounded.status === "too-large" ? 413 : 400);
  }

  let form: FormData;
  try {
    // Re-wrap the size-capped bytes so the standard multipart parser can run
    // against a body that is now guaranteed to be bounded.
    form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: new Blob([bounded.body]),
    }).formData();
  } catch {
    return result("unavailable", 400);
  }

  const parsed = fieldsSchema.safeParse({
    learnerId: form.get("learnerId"),
    programSlug: form.get("programSlug"),
    target: form.get("target"),
  });
  const audio = form.get("file");
  if (!parsed.success || !(audio instanceof Blob) || audio.size === 0) {
    return result("unavailable", 400);
  }

  const { learnerId, programSlug, target } = parsed.data;
  try {
    // §8 two-control gate, same as /api/practice: the learner must belong to
    // this account with an ACTIVE enrollment in the program being played
    // (getEnrollmentForGate resolves ownership), AND the parent must have
    // explicitly opted this learner in (default is off). Fail closed on all.
    const [enrollment, settings] = await Promise.all([
      getEnrollmentForGate(account.accountId, learnerId, programSlug),
      getLearnerSettings(account.accountId, learnerId),
    ]);
    if (!enrollment || enrollment.status !== "active" || settings?.oralReading !== true) {
      return result("unavailable", 403);
    }
  } catch (error) {
    captureNonCritical("oral-reading learner gate failed", error);
    return result("unavailable", 403);
  }

  try {
    // The raw text exists only inside this request scope. It is immediately
    // reduced to a tri-state and is never returned, logged, or persisted.
    const transcript = await transcribeOralReading(audio, target);
    return result(matchOralReading(target, transcript));
  } catch (error) {
    captureNonCritical("oral-reading transcription failed", error);
    return result("unavailable");
  }
}
