import { NextResponse } from "next/server";
import { captureNonCritical } from "@/lib/capture";
import { REQUIRED_COLUMNS, liveColumns, missingColumns } from "@/lib/db/health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const missing = missingColumns(REQUIRED_COLUMNS, await liveColumns());
    if (missing.length > 0) {
      return NextResponse.json({ status: "degraded", reason: "schema-drift", missing }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    // This is a PUBLIC endpoint — never echo a raw error message (it can leak DB
    // host/driver internals). Log non-critically and return an opaque reason.
    captureNonCritical("health check failed", err);
    return NextResponse.json({ status: "down", reason: "internal_error" }, { status: 503 });
  }
}
