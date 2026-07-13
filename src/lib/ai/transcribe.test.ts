import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeOralReading } from "./transcribe";

describe("transcribeOralReading", () => {
  beforeEach(() => {
    process.env.LITELLM_URL = "http://litellm.test/v1/";
    process.env.LITELLM_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts multipart audio through LiteLLM with the model and target prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "there" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

    await expect(transcribeOralReading(audio, "there")).resolves.toBe("there");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://litellm.test/v1/audio/transcriptions");
    expect(init.headers).toEqual({ authorization: "Bearer test-key" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("kaelyn-stt");
    expect(form.get("prompt")).toBe("there");
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(form.get("response_format")).toBeNull();
  });

  it("opts into verbose word timestamps without changing the default call shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "we can see",
          words: [
            { word: "we", start: 0, end: 0.4 },
            { word: "can", start: 0.4, end: 0.8, probability: 0.7 },
            { word: "see", start: 0.8, end: 1.2 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeOralReading(new Blob([new Uint8Array([1])]), "we can see", {
        wordTimestamps: true,
      }),
    ).resolves.toEqual({
      text: "we can see",
      words: [
        { word: "we", start: 0, end: 0.4 },
        { word: "can", start: 0.4, end: 0.8, probability: 0.7 },
        { word: "see", start: 0.8, end: 1.2 },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("response_format")).toBe("verbose_json");
  });

  it("tolerates a verbose response whose words field was stripped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "we can see" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      transcribeOralReading(new Blob([new Uint8Array([1])]), "we can see", {
        wordTimestamps: true,
      }),
    ).resolves.toEqual({ text: "we can see" });
  });

  it("throws when the gateway fails or omits text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(transcribeOralReading(new Blob(["audio"]), "read")).rejects.toThrow(
      "LiteLLM transcription failed (503)",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(transcribeOralReading(new Blob(["audio"]), "read")).rejects.toThrow(
      "no text",
    );
  });
});
