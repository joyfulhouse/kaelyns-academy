import { describe, expect, it } from "vitest";
import {
  PIN_REGEX,
  UNLOCK_TTL_MS,
  hashPin,
  mintUnlockToken,
  nextParentPinFailure,
  verifyPin,
  verifyUnlockToken,
} from "./parent-pin";

describe("parent PIN hashing", () => {
  it("round-trips a valid PIN without storing the PIN itself", async () => {
    const hash = await hashPin("4826");

    expect(hash).not.toContain("4826");
    await expect(verifyPin("4826", hash)).resolves.toBe(true);
  });

  it("rejects a wrong PIN and malformed stored values", async () => {
    const hash = await hashPin("4826");

    await expect(verifyPin("4827", hash)).resolves.toBe(false);
    await expect(verifyPin("4826", "not-a-pin-hash")).resolves.toBe(false);
  });

  it("uses a fresh per-record salt", async () => {
    const first = await hashPin("4826");
    const second = await hashPin("4826");

    expect(first).not.toBe(second);
  });
});

describe("parent PIN validation", () => {
  it.each(["1234", "12345", "123456"])("accepts %s", (pin) => {
    expect(PIN_REGEX.test(pin)).toBe(true);
  });

  it.each(["123", "1234567", "12a4", "12 34", ""])("rejects %s", (pin) => {
    expect(PIN_REGEX.test(pin)).toBe(false);
  });
});

describe("parent PIN durable backoff", () => {
  const now = 1_700_000_000_000;

  it("locks at the threshold and escalates subsequent cooldowns deterministically", () => {
    expect(nextParentPinFailure(3, now)).toEqual({
      failedAttempts: 4,
      lockedUntil: null,
    });
    expect(nextParentPinFailure(4, now)).toEqual({
      failedAttempts: 5,
      lockedUntil: now + 60_000,
    });
    expect(nextParentPinFailure(5, now)).toEqual({
      failedAttempts: 6,
      lockedUntil: now + 5 * 60_000,
    });
    expect(nextParentPinFailure(6, now)).toEqual({
      failedAttempts: 7,
      lockedUntil: now + 15 * 60_000,
    });
    expect(nextParentPinFailure(20, now).lockedUntil).toBe(now + 15 * 60_000);
  });
});

describe("parent unlock tokens", () => {
  const now = 1_700_000_000_000;
  const accountId = "account-1";
  const secret = "test-secret-with-enough-entropy";

  it("mints an account-bound token valid for the configured TTL", () => {
    const token = mintUnlockToken(accountId, now, secret);

    expect(verifyUnlockToken(token, accountId, now + UNLOCK_TTL_MS - 1, secret)).toBe(true);
    expect(verifyUnlockToken(token, accountId, now + UNLOCK_TTL_MS, secret)).toBe(false);
  });

  it("rejects a token for another account", () => {
    const token = mintUnlockToken(accountId, now, secret);

    expect(verifyUnlockToken(token, "account-2", now, secret)).toBe(false);
  });

  it("rejects tampered and malformed tokens", () => {
    const token = mintUnlockToken(accountId, now, secret);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyUnlockToken(tampered, accountId, now, secret)).toBe(false);
    expect(verifyUnlockToken("not-a-token", accountId, now, secret)).toBe(false);
  });
});
