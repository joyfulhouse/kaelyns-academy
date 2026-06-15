// src/lib/audio/kokoro.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeMp3 } from "./kokoro";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("synthesizeMp3", () => {
  it("POSTs Kokoro /audio/speech as mp3 and returns the bytes", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await synthesizeMp3("hello", "af_heart", 0.9);

    expect(out).toEqual(bytes);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://kokoro.test/v1/audio/speech");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      model: "kokoro",
      input: "hello",
      voice: "af_heart",
      response_format: "mp3",
      speed: 0.9,
    });
  });

  it("throws on a non-OK Kokoro response", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(synthesizeMp3("hi", "af_heart", 0.9)).rejects.toThrow(/kokoro 503/);
  });
});
