// src/lib/rate-limit.ts
/**
 * Best-effort, PER-INSTANCE fixed-window rate limiter. State lives in a single
 * module-level Map, so each Node process (the deployment runs 2 replicas behind
 * Traefik) keeps its own counters: a caller can burst up to `limit * replicas`
 * cluster-wide before every instance trips. This is therefore a SECONDARY
 * defense against denial-of-wallet / resource-exhaustion — the PRIMARY defense
 * is authentication (only signed-in accounts reach the gated routes). A truly
 * cluster-wide limit would need a shared store (Redis / a DB counter); we keep
 * this dependency-free on purpose.
 *
 * Fixed-window semantics: the first request for a key opens a window of
 * `windowMs`; up to `limit` requests are allowed within it; the window resets
 * once it elapses. Expired entries are pruned lazily on access (no timers), so
 * the Map only holds keys seen within the current window.
 */

interface Window {
  /** Requests counted in the current window. */
  count: number;
  /** Epoch ms at which the current window closes and the counter resets. */
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitOptions {
  /** Max requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** True if this request is within the limit (and has been counted). */
  ok: boolean;
  /** Seconds until the window resets; 0 when `ok`. Suitable for `Retry-After`. */
  retryAfterSec: number;
}

/**
 * Record one hit against `key` and report whether it is allowed. `Date.now()` is
 * the only clock, so tests can advance time with fake timers to exercise window
 * boundaries.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  // No window yet, or the previous one has elapsed: open a fresh window. We also
  // take this chance to prune other expired keys so the Map can't grow unbounded
  // under a churn of distinct keys.
  if (!existing || now >= existing.resetAt) {
    pruneExpired(now);
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count >= opts.limit) {
    // Round up so the client never retries a hair before the window actually
    // resets (a 0-second Retry-After would invite an immediate, still-blocked hit).
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Drop windows that have already closed. Called lazily, never on a timer. */
function pruneExpired(now: number): void {
  for (const [key, window] of windows) {
    if (now >= window.resetAt) windows.delete(key);
  }
}
