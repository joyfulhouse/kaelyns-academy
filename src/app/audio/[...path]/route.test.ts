import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function call(path: string[]): Promise<Response> {
  return GET(new Request("http://test/audio"), { params: Promise.resolve({ path }) });
}

describe("audio clip proxy route", () => {
  afterEach(() => {
    delete process.env.AUDIO_ORIGIN;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("404s when AUDIO_ORIGIN is unset (client falls back to TTS)", async () => {
    const res = await call(["zh-TW", "zhuyin-b.m4a"]);
    expect(res.status).toBe(404);
  });

  it("rejects path traversal / unexpected segments before any fetch", async () => {
    process.env.AUDIO_ORIGIN = "http://minio.test/bucket";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const bad of [["..", "secret"], ["zh-TW", "a/b"], ["a", "b", "c", "d"], ["zh TW", "x.m4a"]]) {
      const res = await call(bad);
      expect(res.status, bad.join("/")).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams a found clip from the origin with cache headers", async () => {
    process.env.AUDIO_ORIGIN = "http://minio.test/bucket/";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["clip"]), { status: 200, headers: { "content-type": "audio/mp4" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await call(["zh-TW", "zhuyin-b.m4a"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    // Slash normalized; segments preserved.
    expect(fetchMock).toHaveBeenCalledWith("http://minio.test/bucket/zh-TW/zhuyin-b.m4a", {
      cache: "no-store",
    });
  });

  it("404s when the upstream object is missing", async () => {
    process.env.AUDIO_ORIGIN = "http://minio.test/bucket";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const res = await call(["zh-TW", "nope.m4a"]);
    expect(res.status).toBe(404);
  });
});
