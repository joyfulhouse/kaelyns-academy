import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * deleteAccountAction re-auth gate (P6.5 / spec §8) — the COPPA-critical
 * assertion: a wrong/missing typed-email OR wrong password refuses with
 * reason:"reauth-failed" and DELETES NOTHING (deleteAccount is never called).
 * There is no live DB; the store + Better Auth surface are mocked, and we assert
 * the action's control flow (re-auth before delete; delete only when both pass).
 */

// All spies referenced inside vi.mock factories must be hoisted (the factories
// are lifted above normal declarations). FakeAPIError is the sentinel
// verifyPassword throws on a wrong password.
const {
  FakeAPIError,
  getSession,
  verifyPassword,
  signOut,
  deleteAccount,
  pinGateLocked,
  recoveryRate,
} = vi.hoisted(() => {
  class FakeAPIError extends Error {}
  return {
    FakeAPIError,
    getSession: vi.fn(),
    verifyPassword: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
    pinGateLocked: { value: false },
    recoveryRate: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession, verifyPassword, signOut } }),
}));
// isAPIError recognizes our sentinel so the action maps it to reauth-failed.
vi.mock("better-auth/api", () => ({
  isAPIError: (e: unknown) => e instanceof FakeAPIError,
}));

// Keep the PIN gate open in this suite so it can focus on the re-auth boundary.
vi.mock("@/lib/parent-pin-gate", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/parent-pin-gate")>()),
  withUnlockedAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) => {
    const actual = await importActual<typeof import("@/lib/parent-pin-gate")>();
    if (pinGateLocked.value) throw new actual.ParentAreaLockedError();
    return fn({ accountId: "U1", userId: "U1" });
  }),
}));

vi.mock("@/lib/parent-pin-recovery-rate", () => ({
  checkParentPinRecoveryRateLimit: recoveryRate,
}));

// The destructive store call — a spy so we can assert it's NEVER hit on refusal.
vi.mock("@/lib/tutor/store", () => ({ deleteAccount }));

// headers() is awaited by the action; a stub object is enough (the mocked auth
// surface ignores it).
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// revalidatePath is imported by the module but unused by deleteAccountAction.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteAccountAction } from "./actions";

const EMAIL = "parent@example.com";

beforeEach(() => {
  pinGateLocked.value = false;
  recoveryRate.mockReturnValue({ ok: true, retryAfterSec: 0 });
  getSession.mockResolvedValue({ user: { id: "U1", email: EMAIL } });
  verifyPassword.mockResolvedValue({ status: true });
  signOut.mockResolvedValue(undefined);
  deleteAccount.mockResolvedValue({ deleted: true, deletedLearners: 2, deletedAttempts: 7 });
});
afterEach(() => vi.clearAllMocks());

describe("deleteAccountAction re-auth gate", () => {
  it("returns locked without ever checking the account password", async () => {
    pinGateLocked.value = true;

    const result = await deleteAccountAction({
      password: "correct-horse",
      confirmToken: EMAIL,
    });

    expect(result).toMatchObject({ ok: false, reason: "locked" });
    expect(getSession).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("applies the shared recovery budget before checking the account password", async () => {
    recoveryRate.mockReturnValueOnce({ ok: false, retryAfterSec: 300 });

    const result = await deleteAccountAction({
      password: "correct-horse",
      confirmToken: EMAIL,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "rate-limited",
      retryAfterSec: 300,
    });
    expect(getSession).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("refuses (reauth-failed) and deletes nothing when the typed email is wrong", async () => {
    const result = await deleteAccountAction({ password: "correct-horse", confirmToken: "WRONG@example.com" });
    expect(result).toMatchObject({ ok: false, reason: "reauth-failed" });
    expect(deleteAccount).not.toHaveBeenCalled();
    // The password is never even checked once the email gate fails.
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("refuses (reauth-failed) and deletes nothing when the password is wrong", async () => {
    verifyPassword.mockRejectedValueOnce(new FakeAPIError("Invalid password"));
    const result = await deleteAccountAction({ password: "wrong", confirmToken: EMAIL });
    expect(result).toMatchObject({ ok: false, reason: "reauth-failed" });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("refuses (invalid) and deletes nothing when a field is missing", async () => {
    const result = await deleteAccountAction({ password: "", confirmToken: EMAIL });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("refuses (unauthenticated) and deletes nothing when there is no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const result = await deleteAccountAction({ password: "x", confirmToken: EMAIL });
    expect(result).toMatchObject({ ok: false, reason: "unauthenticated" });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("matches the email case-insensitively (trimmed)", async () => {
    const result = await deleteAccountAction({
      password: "correct-horse",
      confirmToken: "  Parent@Example.COM  ",
    });
    expect(result.ok).toBe(true);
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("deletes (and returns the summary) only when BOTH email and password pass", async () => {
    const result = await deleteAccountAction({ password: "correct-horse", confirmToken: EMAIL });
    expect(result).toEqual({ ok: true, summary: { deletedLearners: 2, deletedAttempts: 7 } });
    // Re-auth happened BEFORE the delete.
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(deleteAccount).toHaveBeenCalledOnce();
    // Session invalidated after the delete.
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("still succeeds if signOut fails after a successful delete (non-fatal)", async () => {
    signOut.mockRejectedValueOnce(new Error("signout boom"));
    const result = await deleteAccountAction({ password: "correct-horse", confirmToken: EMAIL });
    expect(result.ok).toBe(true);
    expect(deleteAccount).toHaveBeenCalledOnce();
  });
});
