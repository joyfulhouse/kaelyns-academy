// src/app/api/tts/route.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/kokoro", () => ({ synthesizeMp3: vi.fn() }));
vi.mock("@/lib/audio/store", () => ({ clipExists: vi.fn(), putClip: vi.fn() }));

import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { clipExists, putClip } from "@/lib/audio/store";
import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://test/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.resetAllMocks());

describe("POST /api/tts", () => {
  it("redirects (303) to the cached clip on a hit", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const res = await POST(post({ text: "Find the word" }));
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

  it("uses the ephemeral prefix when asked", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const res = await POST(post({ text: "one off", persist: "ephemeral" }));
    expect(res.headers.get("location")).toMatch(/^\/audio\/en\/cache\/[0-9a-f]{64}\.mp3$/);
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
});
