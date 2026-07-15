import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

export const PIN_REGEX = /^\d{4,6}$/;
export const UNLOCK_TTL_MS = 15 * 60_000;
const PIN_LOCK_THRESHOLD = 5;

const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const scrypt = promisify(scryptCallback);

/**
 * Advance the durable per-account failure budget using a caller-provided clock.
 * The first lock starts on attempt five; each failed attempt after an expired
 * lock increases the cooldown, capped at fifteen minutes.
 */
export function nextParentPinFailure(
  failedAttempts: number,
  now: number,
): { failedAttempts: number; lockedUntil: number | null } {
  const nextFailedAttempts = failedAttempts + 1;
  const backoffMs =
    nextFailedAttempts < PIN_LOCK_THRESHOLD
      ? 0
      : nextFailedAttempts === PIN_LOCK_THRESHOLD
        ? 60_000
        : nextFailedAttempts === PIN_LOCK_THRESHOLD + 1
          ? 5 * 60_000
          : 15 * 60_000;

  return {
    failedAttempts: nextFailedAttempts,
    lockedUntil: backoffMs === 0 ? null : now + backoffMs,
  };
}

/** Derive a salted, one-way representation of a 4–6 digit parent PIN. */
export async function hashPin(pin: string): Promise<string> {
  if (!PIN_REGEX.test(pin)) throw new Error("PIN must be 4 to 6 digits.");

  const salt = randomBytes(SALT_BYTES);
  const key = await derivePin(pin, salt);
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Verify a PIN against a stored scrypt record with a constant-time compare. */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!PIN_REGEX.test(pin)) return false;

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;

  try {
    const salt = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(parts[2], "base64url");
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

    const actual = await derivePin(pin, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Mint a stateless, account-bound unlock token using a caller-injected clock. */
export function mintUnlockToken(accountId: string, now: number, secret: string): string {
  const expiresAt = now + UNLOCK_TTL_MS;
  const signature = signUnlock(accountId, expiresAt, secret);
  return `${expiresAt}.${signature}`;
}

/**
 * Verify token structure, account binding, signature, and expiry. The caller
 * supplies `now`, so this helper has no wall-clock dependency.
 */
export function verifyUnlockToken(
  token: string | undefined,
  accountId: string,
  now: number,
  secret: string,
): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;

  const expiresAt = Number(parts[0]);
  if (!Number.isSafeInteger(expiresAt) || now >= expiresAt) return false;

  try {
    const actual = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(signUnlock(accountId, expiresAt, secret), "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function derivePin(pin: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(pin, salt, KEY_BYTES)) as Buffer;
}

function signUnlock(accountId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${accountId}:${expiresAt}`)
    .digest("base64url");
}
