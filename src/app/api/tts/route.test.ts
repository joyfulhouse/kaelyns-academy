// src/app/api/tts/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/kokoro", () => ({ synthesizeMp3: vi.fn() }));
vi.mock("@/lib/audio/store", () => ({ clipExists: vi.fn(), putClip: vi.fn() }));
// Keep the real UnauthenticatedError (the route does `instanceof`); stub only the resolver.
vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  requireAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { clipExists, putClip } from "@/lib/audio/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { UnauthenticatedError, requireAccount } from "@/lib/tenancy";
import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://test/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // Default: a signed-in account, under the rate limit.
  vi.mocked(requireAccount).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
});
afterEach(() => vi.resetAllMocks());

describe("POST /api/tts", () => {
  it("401s when there is no session, before any synth", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new UnauthenticatedError());
    const res = await POST(post({ text: "Find the word" }));
    expect(res.status).toBe(401);
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("429s when the per-account rate limit is exceeded, before any synth", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ ok: false, retryAfterSec: 30 });
    const res = await POST(post({ text: "Find the word" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("redirects (303) to the cached ephemeral clip on a hit", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const res = await POST(post({ text: "Find the word" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/audio\/en\/cache\/[0-9a-f]{64}\.mp3$/);
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("falls back to a durable hit when the ephemeral copy is missing", async () => {
    // First check (ephemeral prefix) misses, second check (durable "en") hits.
    vi.mocked(clipExists).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const res = await POST(post({ text: "warmed passage" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/audio\/en\/[0-9a-f]{64}\.mp3$/);
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("synthesizes, write-throughs, and streams mp3 on a miss", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(putClip).mockResolvedValue(true);
    const res = await POST(post({ text: "brand new passage" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(putClip).toHaveBeenCalled();
  });

  it("returns 503 when Kokoro is down (client falls back to Web Speech)", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockRejectedValue(new Error("kokoro 503"));
    const res = await POST(post({ text: "x" }));
    expect(res.status).toBe(503);
  });

  it("rejects an empty/invalid body with 400", async () => {
    const res = await POST(post({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("rejects text longer than the cap with 400, before any synth", async () => {
    const res = await POST(post({ text: "a".repeat(501) }));
    expect(res.status).toBe(400);
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("rejects a literal null JSON body with 400, not a 500", async () => {
    // `JSON.stringify(null)` parses back to null — field access would otherwise throw.
    const res = await POST(post(null));
    expect(res.status).toBe(400);
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });
});
