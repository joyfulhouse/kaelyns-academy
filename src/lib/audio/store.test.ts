// src/lib/audio/store.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
vi.mock("minio", () => ({
  Client: vi.fn(function () {
    return { putObject };
  }),
}));

import { clipExists, putClip } from "./store";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  putObject.mockReset();
});

describe("clipExists", () => {
  it("HEADs the public AUDIO_ORIGIN path and maps ok→true", async () => {
    vi.stubEnv("AUDIO_ORIGIN", "http://minio.test/bucket/");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(clipExists("en", "abc")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://minio.test/bucket/en/abc.mp3");
    expect(init.method).toBe("HEAD");
  });

  it("is false on 404 and false when AUDIO_ORIGIN is unset", async () => {
    vi.stubEnv("AUDIO_ORIGIN", "http://minio.test/bucket");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(clipExists("en", "missing")).resolves.toBe(false);

    vi.stubEnv("AUDIO_ORIGIN", "");
    await expect(clipExists("en", "abc")).resolves.toBe(false);
  });
});

describe("putClip", () => {
  it("returns false (skips) when write creds are not configured", async () => {
    vi.stubEnv("AUDIO_S3_ENDPOINT", "");
    await expect(putClip("en", "abc", new Uint8Array([1]))).resolves.toBe(false);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("writes via minio and returns true when configured", async () => {
    vi.stubEnv("AUDIO_S3_ENDPOINT", "minio.test");
    vi.stubEnv("AUDIO_S3_ACCESS_KEY", "k");
    vi.stubEnv("AUDIO_S3_SECRET_KEY", "s");
    vi.stubEnv("AUDIO_S3_BUCKET", "kaelyns-academy-audio");
    putObject.mockResolvedValue({ etag: "x" });

    await expect(putClip("en", "abc", new Uint8Array([1, 2]))).resolves.toBe(true);
    const [bucket, objectName, , , meta] = putObject.mock.calls[0];
    expect(bucket).toBe("kaelyns-academy-audio");
    expect(objectName).toBe("en/abc.mp3");
    expect(meta["Content-Type"]).toBe("audio/mpeg");
  });

  it("returns false (never throws) when the write fails", async () => {
    vi.stubEnv("AUDIO_S3_ENDPOINT", "minio.test");
    vi.stubEnv("AUDIO_S3_ACCESS_KEY", "k");
    vi.stubEnv("AUDIO_S3_SECRET_KEY", "s");
    vi.stubEnv("AUDIO_S3_BUCKET", "b");
    putObject.mockRejectedValue(new Error("down"));
    await expect(putClip("en", "abc", new Uint8Array([1]))).resolves.toBe(false);
  });
});
