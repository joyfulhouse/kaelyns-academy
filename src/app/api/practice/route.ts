import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { captureNonCritical } from "@/lib/capture";
import { generatePracticeItems } from "@/lib/ai/practice";

export const dynamic = "force-dynamic";

// TODO: gate with withAccount() + per-household rate limit (P5). Until then this
// endpoint is unauthenticated; do not expose it publicly before the gate lands.

const requestSchema = z.object({
  kind: z.enum(Object.keys(ACTIVITY_CONFIG_SCHEMAS) as [keyof typeof ACTIVITY_CONFIG_SCHEMAS]),
  band: z.enum(["ready", "stretch"]),
  focus: z.string().min(1).max(200),
  n: z.number().int().min(1).max(8).default(3),
  skillHints: z.array(z.string().min(1).max(60)).max(8).optional(),
});

export async function POST(request: Request) {
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
