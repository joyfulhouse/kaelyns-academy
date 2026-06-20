import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { captureNonCritical } from "@/lib/capture";
import { generatePracticeItems } from "@/lib/ai/practice";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { getAccountOrNull } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

// This endpoint drives the LiteLLM gateway (denial-of-wallet risk). The public
// "explore" learner flow is unauthenticated, so anonymous callers are allowed but
// keyed + capped tighter by client IP — a best-effort, per-instance secondary
// defense (a determined attacker rotating IPs can still spend; a cluster-wide cap
// needs a shared store). Signed-in accounts get a more generous window. Output
// stays bounded + schema-validated regardless of caller.
const RATE_LIMIT_ACCOUNT = { limit: 30, windowMs: 60_000 };
const RATE_LIMIT_ANON = { limit: 10, windowMs: 60_000 };

const requestSchema = z.object({
  kind: z.enum(Object.keys(ACTIVITY_CONFIG_SCHEMAS) as [keyof typeof ACTIVITY_CONFIG_SCHEMAS]),
  band: z.enum(["ready", "stretch"]),
  focus: z.string().min(1).max(200),
  n: z.number().int().min(1).max(8).default(3),
  skillHints: z.array(z.string().min(1).max(60)).max(8).optional(),
});

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

  const { kind, band, focus, n, skillHints } = parsed.data;

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
