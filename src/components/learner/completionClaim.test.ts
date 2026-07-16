import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { claimPlayerCompletion } from "./completionClaim";

// recordAttemptAction validates completionId with z.string().uuid() — the id a
// claim mints must satisfy it in EVERY browser context.
const serverSchema = z.string().uuid();
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => vi.unstubAllGlobals());

describe("claimPlayerCompletion id minting", () => {
  it("mints a server-valid uuid via crypto.randomUUID when available", () => {
    const claim = claimPlayerCompletion(null, "key-1");
    expect(claim).not.toBeNull();
    expect(serverSchema.safeParse(claim?.completionId).success).toBe(true);
  });

  it("still mints a server-valid v4 uuid when crypto.randomUUID is missing (insecure context)", () => {
    // http:// non-localhost origins (e.g. the CI e2e container) expose crypto
    // WITHOUT randomUUID — only getRandomValues. The claim must not throw there.
    const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });

    const claim = claimPlayerCompletion(null, "key-1");
    expect(claim).not.toBeNull();
    expect(claim?.completionId).toMatch(UUID_V4);
    expect(serverSchema.safeParse(claim?.completionId).success).toBe(true);
  });

  it.each([
    ["all-ones", 0xff, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
    ["all-zeros", 0x00, "00000000-0000-4000-8000-000000000000"],
  ])(
    "forces the v4 version/variant bits deterministically (%s bytes)",
    (_label, fill, expected) => {
      // Edge bytes prove the masks: without them, 0xff would yield version "f"
      // / variant "f", and 0x00 version "0" / variant "0" — never a false pass.
      const getRandomValues = vi.fn((array: Uint8Array) => {
        array.fill(fill);
        return array;
      });
      vi.stubGlobal("crypto", { getRandomValues });

      const claim = claimPlayerCompletion(null, "key-1");
      expect(getRandomValues).toHaveBeenCalledTimes(1);
      expect(claim?.completionId).toBe(expected);
    },
  );

  it("mints unique ids across claims without randomUUID", () => {
    const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });

    const ids = new Set(
      Array.from({ length: 200 }, (_, i) => claimPlayerCompletion(null, `key-${i}`)?.completionId),
    );
    expect(ids.size).toBe(200);
  });

  it("keeps the single-claim gate: same requestKey is not re-claimed", () => {
    const first = claimPlayerCompletion(null, "key-1");
    expect(claimPlayerCompletion(first, "key-1")).toBeNull();
    expect(claimPlayerCompletion(null, null)).toBeNull();
  });
});
