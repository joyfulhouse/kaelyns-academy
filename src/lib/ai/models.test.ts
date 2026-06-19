import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { chatJSON, TUTOR_FAST } from "./models";

const schema = z.object({ ok: z.boolean() });

/** Build a fake OpenAI-compatible chat-completions response. */
function completion(content: string, ok = true, status = 200): Response {
  const payload = { choices: [{ message: { content } }] };
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

/**
 * A `fetch` that honors its `signal` like the real one: if the signal is already
 * aborted it rejects with an AbortError, otherwise it rejects when the signal
 * fires. This lets us assert the timeout/cancel wiring deterministically, without
 * waiting on the 20s wall-clock default.
 */
function abortAwareFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      const fail = (): void => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (!signal) return; // never resolves (no signal) — not exercised here
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
    });
  });
}

describe("chatJSON (request-bounded gateway call)", () => {
  beforeEach(() => {
    process.env.LITELLM_URL = "http://litellm.test/v1";
    process.env.LITELLM_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("passes a combined AbortSignal to fetch (caller signal is wired in)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await chatJSON({
      model: TUTOR_FAST,
      system: "s",
      user: "u",
      schema,
      signal: controller.signal,
    });

    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    // The signal handed to fetch is the *combined* one, not the caller's own.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal).not.toBe(controller.signal);
  });

  it("always bounds the request even when no caller signal is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await chatJSON({ model: TUTOR_FAST, system: "s", user: "u", schema });

    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects with a clear error when the caller signal aborts the request", async () => {
    vi.stubGlobal("fetch", abortAwareFetch());

    // A pre-aborted caller signal aborts the combined signal immediately, so the
    // fetch rejects with AbortError and chatJSON surfaces it on the thrown path
    // (callers catch and fall back to authored content). Deterministic: no wait.
    const controller = new AbortController();
    controller.abort();

    await expect(
      chatJSON({ model: TUTOR_FAST, system: "s", user: "u", schema, signal: controller.signal }),
    ).rejects.toThrow(/LiteLLM request (aborted|timed out)/);
  });

  it("maps a mid-flight abort to the thrown-error fallback path", async () => {
    vi.stubGlobal("fetch", abortAwareFetch());

    const controller = new AbortController();
    const pending = chatJSON({
      model: TUTOR_FAST,
      system: "s",
      user: "u",
      schema,
      signal: controller.signal,
    });
    // Abort after the fetch is in flight; the combined signal forwards it.
    controller.abort();

    await expect(pending).rejects.toThrow(/LiteLLM request aborted/);
  });
});
