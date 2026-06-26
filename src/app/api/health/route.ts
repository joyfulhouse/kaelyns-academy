import { NextResponse } from "next/server";
import { captureNonCritical } from "@/lib/capture";
import { REQUIRED_COLUMNS, liveColumns, missingColumns } from "@/lib/db/health";

export const dynamic = "force-dynamic";

// This route is hit by k8s liveness/readiness probes, ArgoCD, and public uptime
// checks — many times a minute. During a DB outage EVERY probe lands in the catch
// below, so capturing each one would flood Sentry (burning quota and burying the
// real incident signal) exactly when the system is degraded. Throttle captures to
// at most one per process per window: the probe's own 503 is the high-frequency
// signal; Sentry just needs the periodic breadcrumb. Module-scope state is fine —
// it's a plain timestamp (no DB/service handle), so it doesn't break `next build`.
const CAPTURE_THROTTLE_MS = 60_000;
let lastCaptureAt = 0;

export async function GET() {
  try {
    const missing = missingColumns(REQUIRED_COLUMNS, await liveColumns());
    if (missing.length > 0) {
      return NextResponse.json({ status: "degraded", reason: "schema-drift", missing }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    // This is a PUBLIC endpoint — never echo a raw error message (it can leak DB
    // host/driver internals). Log non-critically (throttled, see above) and return
    // an opaque reason.
    const now = Date.now();
    if (now - lastCaptureAt >= CAPTURE_THROTTLE_MS) {
      lastCaptureAt = now;
      captureNonCritical("health check failed", err);
    }
    return NextResponse.json({ status: "down", reason: "internal_error" }, { status: 503 });
  }
}
