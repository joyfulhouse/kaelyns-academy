// src/lib/rate-limit.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

// Drive Date.now() deterministically so window boundaries are exact and tests
// never depend on wall-clock timing.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

const OPTS = { limit: 3, windowMs: 60_000 };

// Unique key per test so the module-level Map can't leak counters between cases.
let n = 0;
const freshKey = (): string => `k${(n += 1)}`;

describe("checkRateLimit", () => {
  it("allows requests up to the limit within a window", () => {
    const key = freshKey();
    for (let i = 0; i < OPTS.limit; i += 1) {
      expect(checkRateLimit(key, OPTS)).toEqual({ ok: true, retryAfterSec: 0 });
    }
  });

  it("blocks the request that exceeds the limit and reports retryAfter", () => {
    const key = freshKey();
    for (let i = 0; i < OPTS.limit; i += 1) checkRateLimit(key, OPTS);

    // 4th hit in the same window is rejected; the window has 60s left, so the
    // client is told to wait the full window (rounded up).
    const blocked = checkRateLimit(key, OPTS);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);

    // Partway through the window, retryAfter shrinks toward the reset.
    vi.setSystemTime(59_500);
    expect(checkRateLimit(key, OPTS).retryAfterSec).toBe(1);
  });

  it("resets the counter once the window elapses", () => {
    const key = freshKey();
    for (let i = 0; i < OPTS.limit; i += 1) checkRateLimit(key, OPTS);
    expect(checkRateLimit(key, OPTS).ok).toBe(false);

    // Cross the window boundary: a brand-new window opens and the hit is allowed.
    vi.setSystemTime(OPTS.windowMs);
    expect(checkRateLimit(key, OPTS)).toEqual({ ok: true, retryAfterSec: 0 });
  });

  it("keys are independent", () => {
    const a = freshKey();
    const b = freshKey();
    for (let i = 0; i < OPTS.limit; i += 1) checkRateLimit(a, OPTS);
    expect(checkRateLimit(a, OPTS).ok).toBe(false);
    // A different key is unaffected by `a` exhausting its window.
    expect(checkRateLimit(b, OPTS).ok).toBe(true);
  });
});
