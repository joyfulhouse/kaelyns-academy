import { describe, expect, it, vi } from "vitest";
import { dedupeInflight, mapWithConcurrency } from "./concurrency";

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(() => r()));

/** A promise plus its resolver, so a test can hold a task "in flight" deliberately. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(Array.from({ length: 50 }), 4, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await tick();
      await tick();
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1); // actually ran concurrently, not serialized
  });

  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("swallows per-item rejections (best-effort)", async () => {
    const seen: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        seen.push(n);
      }),
    ).resolves.toBeUndefined();
    expect(seen.sort((a, b) => a - b)).toEqual([1, 3]);
  });
});

describe("dedupeInflight", () => {
  it("shares one promise for concurrent identical keys (factory runs once)", async () => {
    const map = new Map<string, Promise<number>>();
    const d = deferred<number>();
    const factory = vi.fn(() => d.promise);

    const a = dedupeInflight(map, "k", factory);
    const b = dedupeInflight(map, "k", factory);
    expect(a).toBe(b); // the very same promise object, not just an equal value
    expect(factory).toHaveBeenCalledTimes(1); // second call reused the in-flight task

    d.resolve(7);
    await expect(a).resolves.toBe(7);
    await expect(b).resolves.toBe(7);
  });

  it("clears the key after the task settles so a later call re-runs", async () => {
    const map = new Map<string, Promise<number>>();
    const factory = vi.fn<() => Promise<number>>(async () => 1);

    await dedupeInflight(map, "k", factory);
    await tick(); // let the settle-time cleanup run
    expect(map.has("k")).toBe(false); // slot cleared

    await dedupeInflight(map, "k", factory);
    expect(factory).toHaveBeenCalledTimes(2); // fresh call re-invoked the factory
  });

  it("clears the key on rejection too (a failed task is not cached)", async () => {
    const map = new Map<string, Promise<number>>();
    const failing = vi.fn<() => Promise<number>>(async () => {
      throw new Error("boom");
    });

    await expect(dedupeInflight(map, "k", failing)).rejects.toThrow("boom");
    await tick();
    expect(map.has("k")).toBe(false); // rejected slot cleared → next call retries

    const ok = vi.fn<() => Promise<number>>(async () => 9);
    await expect(dedupeInflight(map, "k", ok)).resolves.toBe(9);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("keeps distinct keys independent", async () => {
    const map = new Map<string, Promise<string>>();
    const a = dedupeInflight(map, "a", async () => "A");
    const b = dedupeInflight(map, "b", async () => "B");
    expect(a).not.toBe(b);
    await expect(a).resolves.toBe("A");
    await expect(b).resolves.toBe("B");
  });
});
