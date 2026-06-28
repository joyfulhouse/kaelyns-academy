// src/lib/api/respond.ts
/**
 * Uniform JSON error envelope shared by the API route handlers. Every gated route
 * replies with `{ error: <string> }` and a status code; centralizing the shape
 * keeps those envelopes byte-identical across routes. Build-safe: no I/O, no
 * service access — just constructs a `NextResponse`.
 */
import { NextResponse } from "next/server";

/** `NextResponse.json({ error }, { status })` — the canonical error reply. */
export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}
