import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { findActivity, getSkill } from "@/content";
import { captureNonCritical } from "@/lib/capture";
import { generatePracticeItems, provenanceForGeneration } from "@/lib/ai/practice";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { getAccountOrNull } from "@/lib/tenancy";
import { getLearner, getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";

export const dynamic = "force-dynamic";

// This endpoint drives the LiteLLM gateway (denial-of-wallet risk). It serves two
// flows, both with bounded, schema-validated output regardless of caller:
//   • Anonymous "explore" (public/guest learner surface): no account, so no
//     per-child enrollment to gate on — the client sends bounded generation
//     params directly, capped tighter and keyed by client IP.
//   • Signed-in account (§8 parent-gated): the client sends only IDENTIFIERS;
//     generation is allowed ONLY for an owned learner with an ACTIVE, AI-enabled
//     enrollment for the activity's program, and every generation input is
//     derived SERVER-side from the authored activity (a client can't steer the
//     model off-curriculum). Accounts get a more generous rate window.
const RATE_LIMIT_ACCOUNT = { limit: 30, windowMs: 60_000 };
const RATE_LIMIT_ANON = { limit: 10, windowMs: 60_000 };

// Anonymous explore: the guest surface has no enrollment, so it supplies the
// (bounded) generation params. generatePracticeItems still schema-validates output.
const exploreSchema = z.object({
  kind: z.enum(Object.keys(ACTIVITY_CONFIG_SCHEMAS) as [keyof typeof ACTIVITY_CONFIG_SCHEMAS]),
  band: z.enum(["ready", "stretch"]),
  focus: z.string().min(1).max(200),
  n: z.number().int().min(1).max(8).default(3),
  skillHints: z.array(z.string().min(1).max(60)).max(8).optional(),
});

// Signed-in account (§8): client sends only identifiers; the server derives every
// generation input from the authored activity + the parent's enrollment config,
// so a client can't steer the model by borrowing a valid enrolled activityId as a
// token. learnerId/programSlug/activityId are required so the gate can't be
// skipped by omitting fields.
const accountSchema = z.object({
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  // Binds generation to a real activity in the learner's RESOLVED program (C#3):
  // closes the slug-swap (program B's activityId isn't in program A's tree) AND
  // is the source of the server-derived generation inputs (#2).
  activityId: z.string().min(1).max(100),
  // Cap at 2 (the sole caller sends 1; 2 leaves minimal headroom) — a higher cap
  // would let one request amplify token spend N× inside the per-minute limit.
  n: z.number().int().min(1).max(2).default(1),
});

function badJson(): NextResponse {
  return NextResponse.json({ error: "invalid_json" }, { status: 400 });
}
function badRequest(error: z.ZodError): NextResponse {
  return NextResponse.json({ error: "invalid_request", issues: z.flattenError(error) }, { status: 400 });
}

export async function POST(request: Request) {
  // Rate limit BEFORE any model work. Anonymous callers (public explore flow) are
  // allowed but keyed + capped by client IP; signed-in accounts get a generous
  // per-account window.
  const account = await getAccountOrNull();
  const { limitKey, policy } = account
    ? { limitKey: `practice:acct:${account.accountId}`, policy: RATE_LIMIT_ACCOUNT }
    : { limitKey: `practice:ip:${clientIp(request.headers) ?? "noip"}`, policy: RATE_LIMIT_ANON };

  const limit = checkRateLimit(limitKey, policy);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  // Best-effort request-size guard BEFORE buffering the body: this endpoint only
  // ever receives small JSON identifier payloads, so a large content-length is
  // abuse. Absent/chunked length → skip (can't cheaply know the size up front).
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 16384) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badJson();
  }

  // ── Anonymous explore flow (no account → no per-child §8 gate) ──────────────
  if (!account) {
    const parsed = exploreSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const { kind, band, focus, n, skillHints } = parsed.data;
    return generate(kind, band, focus, n, skillHints);
  }

  // ── Signed-in account flow (§8 parent-gated, FAIL-CLOSED) ───────────────────
  const accountId = account.accountId;
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { learnerId, programSlug, activityId, n } = parsed.data;

  // The §8 gate reads (ownership, content-binding, enrollment + settings) all hit
  // the DB. A transient read error must NOT surface as a raw 500 that bypasses the
  // gate — fail CLOSED: log non-critically and deny AI (403). This wraps the whole
  // gating decision; the bounded generate() below keeps its own try/catch.
  let activityKind: Parameters<typeof generatePracticeItems>[0];
  let band: Parameters<typeof generatePracticeItems>[1];
  let focus: string;
  let skillHints: string[];
  try {
    // Ownership: a foreign/stale learnerId is a 404 (not silent generic practice).
    const ownedLearner = await getLearner(accountId, learnerId);
    if (!ownedLearner) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Content-binding precondition (C#3): resolve the learner's version-pinned
    // program for the CLAIMED slug (the same seam getLearnerStateAction renders +
    // scopes) and verify activityId is in THAT tree — else 403 with no model call.
    const program = await resolveLearnerProgram(accountId, learnerId, programSlug);
    const found = program ? findActivity(program, activityId) : undefined;
    if (!program || !found) {
      return NextResponse.json({ error: "ai_disabled" }, { status: 403 });
    }

    // §8 gate — FAIL-CLOSED. AI is allowed ONLY when: owned (404 above) AND an
    // ACTIVE enrollment exists for (learner, program) AND the per-learner Settings
    // kill-switch isn't off AND this enrollment's config.aiPractice isn't off. Both
    // jsonb reads are safeParsed in the store, so a malformed row fails closed.
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

    // Generation inputs are SERVER-derived from the authored activity (verified
    // above to be in the learner's resolved tree) + the parent's enrollment config.
    const { activity } = found;
    focus =
      (activity.skillTags[0] ? getSkill(activity.skillTags[0])?.label : undefined) ?? activity.title;
    // Parent's per-enrollment difficulty preference wins; else the authored band.
    band = enrollment.config.band ?? activity.band;
    activityKind = activity.kind;
    skillHints = activity.skillTags.slice(0, 8);
  } catch (error) {
    // Any read failure in the gate path → fail closed (never serve AI on error).
    captureNonCritical("practice gate read failed", error);
    return NextResponse.json({ error: "ai_disabled" }, { status: 403 });
  }

  return generate(activityKind, band, focus, n, skillHints);
}

/** Shared bounded generation + uniform error envelope for both flows. */
async function generate(
  kind: Parameters<typeof generatePracticeItems>[0],
  band: Parameters<typeof generatePracticeItems>[1],
  focus: string,
  n: number,
  skillHints: string[] | undefined,
): Promise<NextResponse> {
  try {
    const items = await generatePracticeItems(kind, band, focus, n, { skillHints });
    // Provenance (P6 / §8): bound metadata describing what produced these items,
    // derived SERVER-side from the same routing inputs the generator used, and
    // stamped now. The client echoes this back on the resulting attempt so the
    // parent's "what the AI made" trail and the export show model/route/when.
    const { model, route } = provenanceForGeneration(kind, band, skillHints ?? []);
    const gen = { model, route, at: new Date().toISOString() };
    return NextResponse.json({ kind, band, items, gen }, { status: 200 });
  } catch (error) {
    // Generation/validation failed: log non-critically; caller falls back to
    // authored content. We never leak raw model output or a stack to the client.
    captureNonCritical(`practice generation failed for kind=${kind}`, error);
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }
}
