import { NextResponse } from "next/server";
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
    return NextResponse.json({ status: "down", reason: err instanceof Error ? err.message : "unknown" }, { status: 503 });
  }
}
