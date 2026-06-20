// src/components/learner/narrate.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { narrate } from "./narrate";

class FakeAudio {
  src: string;
  onerror: (() => void) | null = null;
  onended: (() => void) | null = null;
  paused = true;
  static last: FakeAudio | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.last = this;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

beforeEach(() => {
  // The suite runs in vitest's `node` environment; narrate guards on `window`,
  // so define a minimal one (the globals it actually uses are stubbed below).
  vi.stubGlobal("window", {});
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  vi.stubGlobal(
    "URL",
    { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} } as unknown as typeof URL,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  FakeAudio.last = null;
});

describe("narrate", () => {
  it("plays the synthesized clip on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    const onUnavailable = vi.fn();
    narrate("Find the word", { onUnavailable });
    await vi.waitFor(() => expect(FakeAudio.last?.paused).toBe(false));
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("falls back when the route responds non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const onUnavailable = vi.fn();
    narrate("x", { onUnavailable });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
  });

  it("falls back when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const onUnavailable = vi.fn();
    narrate("x", { onUnavailable });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
  });

  it("revokes the superseded URL when the same text is cached twice (concurrent misses)", async () => {
    let n = 0;
    const revokeSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: () => `blob:dup-${++n}`,
      revokeObjectURL: revokeSpy,
    } as unknown as typeof URL);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));

    // Two narrate calls for the same text before either caches → both miss and
    // both cacheSet the key; the second supersedes the first URL, which must be
    // revoked rather than leaked.
    const text = "a uniquely concurrent phrase";
    narrate(text, { onUnavailable: vi.fn() });
    narrate(text, { onUnavailable: vi.fn() });

    await vi.waitFor(() => expect(revokeSpy).toHaveBeenCalledWith("blob:dup-1"));
  });

  it("cancel() stops a playing clip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    const handle = narrate("hello", { onUnavailable: vi.fn() });
    await vi.waitFor(() => expect(FakeAudio.last?.paused).toBe(false));
    handle.cancel();
    expect(FakeAudio.last?.paused).toBe(true);
  });
});
