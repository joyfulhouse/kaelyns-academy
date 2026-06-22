// src/lib/audio/phonemize.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { phonemize } from "./phonemize";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("phonemize", () => {
  it("POSTs to <base>/dev/phonemize (server root, NOT /v1) and returns phonemes", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ phonemes: "tˈAbᵊl", tokens: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await phonemize("table");

    expect(out).toBe("tˈAbᵊl");
    const [url, init] = fetchMock.mock.calls[0]!;
    // The /v1 suffix is stripped: the dev endpoint lives at the server root.
    expect(url).toBe("http://kokoro.test/dev/phonemize");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      text: "table",
      language: "a",
    });
  });

  it("targets the server root even when KOKORO_URL has no /v1 suffix", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ phonemes: "kˈæt" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await phonemize("cat");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://kokoro.test/dev/phonemize");
  });

  it("returns null on a non-OK response", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect(await phonemize("table")).toBeNull();
  });

  it("returns null when fetch throws (unreachable/timeout)", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await phonemize("table")).toBeNull();
  });

  it("returns null when the payload has no string phonemes", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ tokens: [] }), { status: 200 })),
    );
    expect(await phonemize("table")).toBeNull();
  });
});
