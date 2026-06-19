import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { captureNonCritical } from "@/lib/capture";
import { generatePracticeItems } from "@/lib/ai/practice";
import { checkRateLimit } from "@/lib/rate-limit";
import { UnauthenticatedError, requireAccount } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

// This endpoint drives the LiteLLM gateway, so it must never be reachable
// unauthenticated/unthrottled (denial-of-wallet). The auth gate is the primary
// defense; the per-account limiter is a best-effort, per-instance secondary one.
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

const requestSchema = z.object({
  kind: z.enum(Object.keys(ACTIVITY_CONFIG_SCHEMAS) as [keyof typeof ACTIVITY_CONFIG_SCHEMAS]),
  band: z.enum(["ready", "stretch"]),
  focus: z.string().min(1).max(200),
  n: z.number().int().min(1).max(8).default(3),
  skillHints: z.array(z.string().min(1).max(60)).max(8).optional(),
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
