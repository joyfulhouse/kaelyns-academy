import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(() => r()));

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
