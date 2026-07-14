import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  FakeAPIError: class FakeAPIError extends Error {},
  getParentPinHash: vi.fn(),
  getParentPinState: vi.fn(),
  recordParentPinFailure: vi.fn(),
  resetParentPinFailures: vi.fn(),
  setParentPin: vi.fn(),
  clearParentPin: vi.fn(),
  hashPin: vi.fn(),
  verifyPin: vi.fn(),
  verifyPassword: vi.fn(),
  cookieSet: vi.fn(),
  captureNonCritical: vi.fn(),
  cookieValue: { value: undefined as string | undefined },
  ip: { value: "203.0.113.1" },
}));

let ipIndex = 0;

vi.mock("@/lib/parent-pin-store", () => ({
  getParentPinHash: mocks.getParentPinHash,
  getParentPinState: mocks.getParentPinState,
  recordParentPinFailure: mocks.recordParentPinFailure,
  resetParentPinFailures: mocks.resetParentPinFailures,
  setParentPin: mocks.setParentPin,
  clearParentPin: mocks.clearParentPin,
}));

vi.mock("@/lib/capture", () => ({ captureNonCritical: mocks.captureNonCritical }));

vi.mock("@/lib/parent-pin", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/parent-pin")>()),
  hashPin: mocks.hashPin,
  verifyPin: mocks.verifyPin,
}));

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "account-1", userId: "account-1" }),
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { verifyPassword: mocks.verifyPassword } }),
}));

vi.mock("better-auth/api", () => ({
  isAPIError: (error: unknown) => error instanceof mocks.FakeAPIError,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "cf-connecting-ip": mocks.ip.value })),
  cookies: vi.fn(async () => ({
    get: () => (mocks.cookieValue.value ? { value: mocks.cookieValue.value } : undefined),
    set: mocks.cookieSet,
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => "test-secret" }));

const {
  clearParentPinByPasswordAction,
  lockParentAreaAction,
  setParentPinAction,
  verifyParentPinAction,
} = await import("./pin-actions");
const { mintUnlockToken } = await import("@/lib/parent-pin");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  ipIndex += 1;
  mocks.ip.value = `203.0.113.${ipIndex}`;
  mocks.getParentPinHash.mockResolvedValue("stored-hash");
  mocks.getParentPinState.mockResolvedValue({
    pinHash: "stored-hash",
    failedAttempts: 0,
    lockedUntil: null,
  });
  mocks.recordParentPinFailure.mockResolvedValue({
    failedAttempts: 1,
    lockedUntil: null,
  });
  mocks.resetParentPinFailures.mockResolvedValue(undefined);
  mocks.cookieValue.value = undefined;
  mocks.hashPin.mockResolvedValue("new-hash");
  mocks.verifyPin.mockResolvedValue(true);
  mocks.verifyPassword.mockResolvedValue({ status: true });
  mocks.clearParentPin.mockResolvedValue(true);
  mocks.setParentPin.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("verifyParentPinAction", () => {
  it("rejects a wrong PIN without setting an unlock cookie", async () => {
    mocks.verifyPin.mockResolvedValueOnce(false);

    const result = await verifyParentPinAction("1234");

    expect(result).toMatchObject({ ok: false, reason: "incorrect" });
    expect(mocks.recordParentPinFailure).toHaveBeenCalledWith(
      "account-1",
      1_700_000_000_000,
    );
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("starts the durable cooldown when a wrong PIN reaches the threshold", async () => {
    mocks.verifyPin.mockResolvedValueOnce(false);
    mocks.recordParentPinFailure.mockResolvedValueOnce({
      failedAttempts: 5,
      lockedUntil: new Date(1_700_000_060_000),
    });

    const result = await verifyParentPinAction("1234");

    expect(result).toMatchObject({
      ok: false,
      reason: "rate-limited",
      retryAfterSec: 60,
    });
  });

  it("rejects an active durable lock before running the PIN KDF", async () => {
    mocks.getParentPinState.mockResolvedValueOnce({
      pinHash: "stored-hash",
      failedAttempts: 5,
      lockedUntil: new Date(1_700_000_060_000),
    });

    const result = await verifyParentPinAction("1234");

    expect(result).toMatchObject({
      ok: false,
      reason: "rate-limited",
      retryAfterSec: 60,
    });
    expect(mocks.verifyPin).not.toHaveBeenCalled();
    expect(mocks.recordParentPinFailure).not.toHaveBeenCalled();
  });

  it("rate-limits the sixth attempt for the same account and IP for 60 seconds", async () => {
    mocks.verifyPin.mockResolvedValue(false);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await verifyParentPinAction("1234")).toMatchObject({ reason: "incorrect" });
    }
    const blocked = await verifyParentPinAction("1234");

    expect(blocked).toMatchObject({ ok: false, reason: "rate-limited", retryAfterSec: 60 });
    expect(mocks.verifyPin).toHaveBeenCalledTimes(5);
  });

  it("sets the secure account unlock cookie after a correct PIN", async () => {
    mocks.getParentPinState.mockResolvedValueOnce({
      pinHash: "stored-hash",
      failedAttempts: 3,
      lockedUntil: null,
    });

    const result = await verifyParentPinAction("1234");

    expect(result).toEqual({ ok: true });
    expect(mocks.resetParentPinFailures).toHaveBeenCalledWith("account-1");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "ka-parent-unlock",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/parent",
        maxAge: 900,
      }),
    );
  });
});

describe("setParentPinAction", () => {
  it("sets the first PIN and refreshes the unlock cookie", async () => {
    mocks.getParentPinHash.mockResolvedValueOnce(null);

    const result = await setParentPinAction("2468", "2468");

    expect(result).toEqual({ ok: true });
    expect(mocks.hashPin).toHaveBeenCalledWith("2468");
    expect(mocks.setParentPin).toHaveBeenCalledWith("account-1", "new-hash");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "ka-parent-unlock",
      expect.any(String),
      expect.objectContaining({ path: "/parent", maxAge: 900 }),
    );
  });

  it("refuses to replace an existing PIN without a valid unlock cookie", async () => {
    const result = await setParentPinAction("2468", "2468");

    expect(result).toMatchObject({ ok: false, reason: "locked" });
    expect(mocks.hashPin).not.toHaveBeenCalled();
    expect(mocks.setParentPin).not.toHaveBeenCalled();
  });

  it("changes an existing PIN when the account has a valid unlock cookie", async () => {
    mocks.cookieValue.value = mintUnlockToken(
      "account-1",
      1_700_000_000_000,
      "test-secret",
    );

    const result = await setParentPinAction("2468", "2468");

    expect(result).toEqual({ ok: true });
    expect(mocks.setParentPin).toHaveBeenCalledWith("account-1", "new-hash");
  });

  it("rejects a non-numeric or mismatched confirmation", async () => {
    expect(await setParentPinAction("12ab", "12ab")).toMatchObject({ reason: "invalid" });
    expect(await setParentPinAction("2468", "2469")).toMatchObject({ reason: "invalid" });
    expect(mocks.setParentPin).not.toHaveBeenCalled();
  });

  it("never sends a derived PIN hash from a store error to Sentry", async () => {
    mocks.getParentPinHash.mockResolvedValueOnce(null);
    mocks.setParentPin.mockRejectedValueOnce(new Error("query params included new-hash"));

    const result = await setParentPinAction("2468", "2468");

    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
    const capturedError = mocks.captureNonCritical.mock.calls[0]?.[1];
    expect(String(capturedError)).not.toContain("new-hash");
    expect(String(capturedError)).not.toContain("2468");
  });
});

describe("clearParentPinByPasswordAction", () => {
  it("does not clear the PIN when Better Auth rejects the password", async () => {
    mocks.verifyPassword.mockRejectedValueOnce(new mocks.FakeAPIError("Invalid password"));

    const result = await clearParentPinByPasswordAction("wrong-password");

    expect(result).toMatchObject({ ok: false, reason: "reauth-failed" });
    expect(mocks.clearParentPin).not.toHaveBeenCalled();
  });

  it("still works while locked, clearing the row after password verification", async () => {
    const result = await clearParentPinByPasswordAction("correct-password");

    expect(result).toEqual({ ok: true });
    expect(mocks.clearParentPin).toHaveBeenCalledWith("account-1");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "ka-parent-unlock",
      "",
      expect.objectContaining({ path: "/parent", maxAge: 0 }),
    );
  });

  it("rate-limits the sixth password KDF attempt for five minutes", async () => {
    mocks.verifyPassword.mockRejectedValue(new mocks.FakeAPIError("Invalid password"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await clearParentPinByPasswordAction("wrong-password")).toMatchObject({
        reason: "reauth-failed",
      });
    }
    const blocked = await clearParentPinByPasswordAction("wrong-password");

    expect(blocked).toMatchObject({
      ok: false,
      reason: "rate-limited",
      retryAfterSec: 300,
    });
    expect(mocks.verifyPassword).toHaveBeenCalledTimes(5);
  });
});

describe("lockParentAreaAction", () => {
  it("expires the unlock cookie so handoff immediately relocks the parent area", async () => {
    const result = await lockParentAreaAction();

    expect(result).toEqual({ ok: true });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "ka-parent-unlock",
      "",
      expect.objectContaining({ path: "/parent", maxAge: 0 }),
    );
  });
});
