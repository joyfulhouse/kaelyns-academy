import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { findActivity } from "@/content";
import { captureNonCritical } from "@/lib/capture";
import { generatePracticeItems } from "@/lib/ai/practice";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { UnauthenticatedError, requireAccount } from "@/lib/tenancy";
import { getLearner, getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";

export const dynamic = "force-dynamic";

// This endpoint drives the LiteLLM gateway, so it must never be reachable
// unauthenticated/unthrottled (denial-of-wallet). The auth gate is the primary
// defense; the per-account limiter is a best-effort, per-instance secondary one.
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

const requestSchema = z.object({
  kind: z.enum(Object.keys(ACTIVITY_CONFIG_SCHEMAS) as [keyof typeof ACTIVITY_CONFIG_SCHEMAS]),
  band: z.enum(["ready", "stretch"]),
  focus: z.string().min(1).max(200),
  // Cap at 2 (the sole caller sends 1; 2 leaves minimal headroom). A higher cap
  // would let one request amplify token spend N× inside the per-minute limit.
  n: z.number().int().min(1).max(2).default(1),
  skillHints: z.array(z.string().min(1).max(60)).max(8).optional(),
  // Per-child AI gate (spec §8). Required so the server always enforces the
  // parental control — no client may bypass by omitting these fields.
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  // The authored activity this practice is "more like". Required so the gate can
  // bind generation to a real activity in the learner's RESOLVED program (C#3):
  // it closes the slug-swap where a client borrows program A's AI-enabled
  // enrollment to generate program B's content (B's activityId won't be in A's
  // resolved tree).
  activityId: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  // Auth + rate limit BEFORE any model work. Only signed-in parent accounts may
  // spend tokens here, and each is capped to a sane per-minute burst.
  let accountId: string;
  try {
    ({ accountId } = await requireAccount());
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    throw error;
  }

  const limit = checkRateLimit(`practice:${accountId}`, RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const { kind, band, focus, n, skillHints, learnerId, programSlug, activityId } = parsed.data;

  // Ownership check: a foreign or stale learnerId returns 404 rather than
  // silently generating generic practice. (The §8 aiPractice 403 below is a
  // separate, subsequent gate — do not merge these two checks.)
  const ownedLearner = await getLearner(accountId, learnerId);
  if (!ownedLearner) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Content-binding precondition (C#3) — BEFORE the enrollment/settings gate.
  // Resolve the learner's version-pinned program for the CLAIMED slug (the same
  // seam getLearnerStateAction renders + scopes), and verify the requested
  // activityId is actually in THAT tree. A missing program or an activityId that
  // doesn't belong to it → 403 with no model call: this closes the slug-swap
  // (you can't borrow program A's AI-enabled enrollment to generate program B's
  // content, because B's activityId isn't in A's resolved tree). This is an
  // ADDITIONAL gate; the fail-closed enrollment/settings checks below still run.
  const program = await resolveLearnerProgram(accountId, learnerId, programSlug);
  if (!program || findActivity(program, activityId) === undefined) {
    return NextResponse.json({ error: "ai_disabled" }, { status: 403 });
  }

  // Server-side AI gate (spec §8) — FAIL-CLOSED. AI generation is allowed ONLY
  // when ALL of these hold; any missing/disabled signal blocks before any model
  // call (regardless of what the client sent — learnerId/programSlug are required
  // in the schema so this gate cannot be skipped by omitting fields):
  //   (a) the learner is owned by this account (the 404 above),
  //   (b) an ACTIVE enrollment exists for this exact (learner, program) — a
  //       missing, paused, or soft-removed enrollment blocks,
  //   (c) the per-learner Settings kill-switch isn't off (all-programs), and
  //   (d) this enrollment's config.aiPractice isn't off (per-program).
  // Both jsonb reads are safeParsed in the store, so a malformed row can't
  // fail-open the `=== false` checks.
  const [settings, enrollment] = await Promise.all([
    getLearnerSettings(accountId, learnerId),
    getEnrollmentForGate(accountId, learnerId, programSlug),
  ]);
  const aiOff =
    settings?.aiPractice === false ||
    !enrollment ||
    enrollment.status !== "active" ||
    enrollment.config.aiPractice === false;
  if (aiOff) {
    return NextResponse.json({ error: "ai_disabled" }, { status: 403 });
  }

  try {
    const items = await generatePracticeItems(kind, band, focus, n, { skillHints });
    return NextResponse.json({ kind, band, items }, { status: 200 });
  } catch (error) {
    // Generation/validation failed: log non-critically; caller falls back to
    // authored content. We never leak raw model output or a stack to the client.
    captureNonCritical(`practice generation failed for kind=${kind}`, error);
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }
}
