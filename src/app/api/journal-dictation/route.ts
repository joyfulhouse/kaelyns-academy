import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribeOralReading } from "@/lib/ai/transcribe";
import { resolveRateLimit } from "@/lib/api/rate";
import { captureNonCritical } from "@/lib/capture";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";
import { resolveProgramForEnrollmentVersion } from "@/lib/content/repository";
import { getUnit } from "@/content";
import { journalPromptConfig } from "@/content/activity-configs";
import { isEnrollmentUnitActive } from "@/lib/content/config";
import { boundDictationText } from "@/activities/journal-prompt/dictation";

export const dynamic = "force-dynamic";

// A dictation take is ≤15s of audio (~200-400KB); the cap leaves generous room
// while still rejecting an adversarial upload before it exhausts a replica.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT_ACCOUNT = { limit: 30, windowMs: 60_000 };
const RATE_LIMIT_ANON = { limit: 10, windowMs: 60_000 };
const BODY_READ_DEADLINE_MS = 15_000;
const MAX_CONCURRENT_READS = 8;

let activeReads = 0;

const fieldsSchema = z
  .object({
    learnerId: z.string().min(1).max(100),
    programSlug: z.string().min(1).max(100),
    unitKey: z.string().min(1).max(100),
    activityId: z.string().min(1).max(100),
  })
  .strict();

/** Calm, uniform failure: the client keeps the child typing. Never leaks why. */
function unavailable(status: number, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ text: "" }, { status, headers });
}

function declaredTooLarge(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}

/**
 * Buffer the request body while enforcing the byte cap DURING the read — the
 * same defense the oral-reading route uses: Content-Length is forgeable and
 * `request.formData()` would buffer the whole (unbounded) body before any size
 * check, so a chunked/oversized upload is cut off mid-stream here instead.
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
  const deadline = setTimeout(() => void reader.cancel(), BODY_READ_DEADLINE_MS);
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
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

/**
 * The authored activity at this route identity must be a journal-prompt that
 * actually offers `dictate` — so this route can only ever transcribe for a
 * writing activity the curriculum enabled the microphone on, never as an
 * open-ended transcription oracle.
 */
function dictateEnabled(
  program: Awaited<ReturnType<typeof resolveProgramForEnrollmentVersion>>,
  unitKey: string,
  activityId: string,
): boolean {
  if (!program) return false;
  const unit = getUnit(program, unitKey);
  const activity = unit?.lessons
    .flatMap((lesson) => lesson.activities)
    .find((candidate) => candidate.id === activityId);
  if (!activity || activity.kind !== "journal-prompt") return false;
  const parsed = journalPromptConfig.safeParse(activity.config);
  // Require compose mode too: the Player only ever exposes the mic in compose
  // mode, so a draw-mode journal that happens to list "dictate" must not be a
  // usable STT surface (defense in depth against a mismatched authored config).
  return parsed.success && parsed.data.mode === "compose" && parsed.data.allowModes.includes("dictate");
}

export async function POST(request: Request): Promise<NextResponse> {
  // Resolve identity only to pick the rate-limit bucket — no body parsing, DB
  // reads, or gateway work before the throttle (same order as oral-reading).
  const account = await getAccountOrNull();
  const { key, policy } = resolveRateLimit(account, request, "journal-dictation", {
    account: RATE_LIMIT_ACCOUNT,
    anon: RATE_LIMIT_ANON,
  });
  const limit = checkRateLimit(key, policy);
  if (!limit.ok) return unavailable(429, { "Retry-After": String(limit.retryAfterSec) });

  if (declaredTooLarge(request)) return unavailable(413);

  // Dictation is account-only. Guests never cause the body to be buffered and
  // fall back to typing/scribing in the Player.
  if (!account) return unavailable(403);

  const bounded = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bounded.status !== "ok") {
    if (bounded.status === "busy") return unavailable(503, { "Retry-After": "5" });
    return unavailable(bounded.status === "too-large" ? 413 : 400);
  }

  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: new Blob([bounded.body]),
    }).formData();
  } catch {
    return unavailable(400);
  }

  const parsed = fieldsSchema.safeParse({
    learnerId: form.get("learnerId"),
    programSlug: form.get("programSlug"),
    unitKey: form.get("unitKey"),
    activityId: form.get("activityId"),
  });
  const audio = form.get("file");
  if (!parsed.success || !(audio instanceof Blob) || audio.size === 0) {
    return unavailable(400);
  }

  const { learnerId, programSlug, unitKey, activityId } = parsed.data;
  try {
    // §8 microphone gate: the learner must belong to this account with an ACTIVE
    // enrollment in the unit being played, AND the parent must have explicitly
    // opted this learner into the microphone (settings.oralReading, default off).
    // Same control the oral-reading route enforces. Fail closed on all.
    const [enrollment, settings] = await Promise.all([
      getEnrollmentForGate(account.accountId, learnerId, programSlug),
      getLearnerSettings(account.accountId, learnerId),
    ]);
    if (
      !enrollment ||
      enrollment.status !== "active" ||
      !enrollment.configValid ||
      !isEnrollmentUnitActive(enrollment.config, unitKey) ||
      settings?.oralReading !== true
    ) {
      return unavailable(403);
    }
    const program = await resolveProgramForEnrollmentVersion(
      programSlug,
      enrollment.programVersionId,
    );
    if (!dictateEnabled(program, unitKey, activityId)) return unavailable(403);
  } catch (error) {
    captureNonCritical("journal-dictation learner gate failed", error);
    return unavailable(403);
  }

  try {
    // The recognized text exists only in this request scope. It is returned to
    // the child's OWN client for them to edit into their journal — never logged
    // or persisted here (journal writes store a participation summary, no text).
    // Passing an empty prompt keeps recognition unbiased for open-ended writing.
    // Propagate the request signal: a client disconnect / consent revocation
    // aborts the upstream STT instead of transcribing audio nobody awaits.
    const transcript = await transcribeOralReading(audio, "", { signal: request.signal });
    return NextResponse.json({ text: boundDictationText(transcript) });
  } catch {
    // Sanitized, categorical only — never forward the raw gateway error, which
    // could carry a malformed response body containing the child's words.
    captureNonCritical("journal-dictation transcription failed", new Error("transcription_failed"));
    // 5xx (not 200) so the client's `!response.ok` path surfaces the calm mic
    // fallback instead of silently swallowing a gateway failure.
    return unavailable(502);
  }
}
