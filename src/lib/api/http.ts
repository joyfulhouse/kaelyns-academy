// src/lib/api/http.ts
/**
 * Shared request-body intake for the API route handlers: a best-effort
 * content-length guard followed by a JSON parse, returned as a discriminated
 * result the caller maps to an error response. Both gated routes only ever
 * receive small JSON payloads, so a large content-length is abuse — reject it
 * BEFORE buffering the body. An absent/chunked/non-numeric length can't be cheaply
 * sized up front, so the guard skips it (and the route's own schema bounds what
 * reaches any expensive work). Build-safe: pure request handling, no service access.
 */

/** Outcome of {@link readJsonBody}: a parsed body, or a mappable failure. */
export type ReadJsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 413; error: "payload_too_large" }
  | { ok: false; status: 400; error: "invalid_json" };

/**
 * Guard `req`'s content-length against `maxBytes`, then parse its JSON body.
 * - finite content-length `> maxBytes` → `{ ok: false, 413, payload_too_large }`
 * - parse throws (malformed JSON) → `{ ok: false, 400, invalid_json }`
 * - otherwise → `{ ok: true, body }` (note: a literal `null` parses successfully;
 *   callers that access fields must still null-check the body themselves).
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<ReadJsonBodyResult> {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }

  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}
