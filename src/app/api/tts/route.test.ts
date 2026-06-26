// src/app/api/tts/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/kokoro", () => ({ synthesizeMp3: vi.fn() }));
vi.mock("@/lib/audio/store", () => ({ clipExists: vi.fn(), putClip: vi.fn() }));
vi.mock("@/lib/tenancy", () => ({ getAccountOrNull: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { clipExists, putClip } from "@/lib/audio/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // Default: a signed-in account, under the rate limit.
  vi.mocked(getAccountOrNull).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
});
afterEach(() => vi.resetAllMocks());

describe("POST /api/tts", () => {
  it("serves anonymous callers (no 401), keyed + capped tighter by client IP", async () => {
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    vi.mocked(clipExists).mockResolvedValue(true); // a cache hit → 303, no synth
    const res = await POST(post({ text: "Find the word" }, { "cf-connecting-ip": "203.0.113.7" }));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(303);
    expect(checkRateLimit).toHaveBeenCalledWith("tts:ip:203.0.113.7", {
      limit: 20,
      windowMs: 60_000,
    });
  });

  it("keys signed-in callers by account with a more generous window", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    await POST(post({ text: "Find the word" }));
    expect(checkRateLimit).toHaveBeenCalledWith("tts:acct:acc-1", {
      limit: 60,
      windowMs: 60_000,
    });
  });

  it("buckets anonymous callers with no determinable IP together", async () => {
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    vi.mocked(clipExists).mockResolvedValue(true);
    await POST(post({ text: "Find the word" })); // no IP headers
    expect(checkRateLimit).toHaveBeenCalledWith("tts:ip:noip", { limit: 20, windowMs: 60_000 });
  });

  it("429s when the rate limit is exceeded, before any synth", async () => {
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

  it("rejects invalid JSON with a 400 {error:invalid_json} envelope", async () => {
    const req = new Request("http://test/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_json" });
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("413s when content-length exceeds the cap, before any synth", async () => {
    const res = await POST(post({ text: "x" }, { "content-length": "20000" }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("does not block a request whose content-length is at/under the cap", async () => {
    vi.mocked(clipExists).mockResolvedValue(true); // cache hit → 303
    const res = await POST(post({ text: "Find the word" }, { "content-length": "16384" }));
    expect(res.status).toBe(303);
  });

  it("falls back to the default voice when the requested voice has illegal chars", async () => {
    // A control char / unsafe token must NOT reach the synth as-is; it falls back
    // to enVoice(). We assert via the cache key: the redirect URL is keyed off the
    // voice, so a hit proves the canonical (default) voice was used for the key.
    vi.mocked(clipExists).mockResolvedValue(true);
    const res = await POST(post({ text: "Find the word", voice: "af_bella\n; rm -rf" }));
    expect(res.status).toBe(303);
    // Same location as the default-voice request (voice was normalized away).
    const def = await POST(post({ text: "Find the word" }));
    expect(res.headers.get("location")).toBe(def.headers.get("location"));
  });

  it("honors a valid voice id (safe charset) as the synth/cache key", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([9]));
    vi.mocked(putClip).mockResolvedValue(true);
    await POST(post({ text: "brand new line", voice: "af_sky" }));
    expect(synthesizeMp3).toHaveBeenCalledWith("brand new line", "af_sky", expect.any(Number));
  });
});
