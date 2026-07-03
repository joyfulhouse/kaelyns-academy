import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * applyPlacementAction / redoCheckpointAction (Adventure 2.0 C1, Task 5): both
 * are thin withAccount-wrapped wrappers around the Task 4 store functions
 * (applyPlacement/redoCheckpoint), which already enforce tenancy by resolving
 * ownership from the checkpoint row's own learner — store.test.ts covers that
 * gate directly (applyPlacement REJECTS for a non-owned row; redoCheckpoint
 * silently no-ops). This test asserts the ACTION's wiring on top of that: a
 * store rejection never escapes as a thrown stack, it settles to a calm
 * `{ ok: false }`, and a real success revalidates the learner's own page.
 */

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "acc-1", userId: "acc-1" }),
  ),
}));

const { applyPlacement, redoCheckpoint } = vi.hoisted(() => ({
  applyPlacement: vi.fn(),
  redoCheckpoint: vi.fn(),
}));
vi.mock("@/lib/tutor/store", () => ({ applyPlacement, redoCheckpoint }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { applyPlacementAction, redoCheckpointAction } from "./actions";

afterEach(() => vi.clearAllMocks());

describe("applyPlacementAction", () => {
  it("returns ok:false (never throws) when the checkpoint isn't owned by this account", async () => {
    // Mirrors applyPlacement's real tenancy-violation behavior: it THROWS
    // inside the transaction rather than returning a sentinel.
    applyPlacement.mockRejectedValueOnce(new Error("learner not found for account"));
    const result = await applyPlacementAction("L1", "CR-not-mine");
    expect(result.ok).toBe(false);
  });

  it("applies and revalidates the learner's own page on success", async () => {
    applyPlacement.mockResolvedValueOnce(undefined);
    const result = await applyPlacementAction("L1", "CR1");
    expect(result).toEqual({ ok: true });
    expect(applyPlacement).toHaveBeenCalledWith("acc-1", "CR1");
    expect(revalidatePath).toHaveBeenCalledWith("/parent/learners/L1");
  });

  it("rejects an empty checkpointResultId (invalid) without calling the store", async () => {
    const result = await applyPlacementAction("L1", "");
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(applyPlacement).not.toHaveBeenCalled();
  });
});

describe("redoCheckpointAction", () => {
  it("returns ok:true for a non-owned/missing row — redoCheckpoint itself no-ops rather than throwing", async () => {
    redoCheckpoint.mockResolvedValueOnce(undefined);
    const result = await redoCheckpointAction("L1", "CR-not-mine");
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false (never throws) when the store rejects unexpectedly", async () => {
    redoCheckpoint.mockRejectedValueOnce(new Error("boom"));
    const result = await redoCheckpointAction("L1", "CR1");
    expect(result.ok).toBe(false);
  });
});
