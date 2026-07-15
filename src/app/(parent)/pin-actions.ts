"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { mapActionError, parseInput } from "@/lib/actions/results";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import {
  PIN_REGEX,
  UNLOCK_TTL_MS,
  hashPin,
  mintUnlockToken,
  verifyPin,
  verifyUnlockToken,
} from "@/lib/parent-pin";
import {
  clearParentPin,
  getParentPinHash,
  getParentPinState,
  recordParentPinFailure,
  resetParentPinFailures,
  setParentPin,
} from "@/lib/parent-pin-store";
import { checkParentPinRecoveryRateLimit } from "@/lib/parent-pin-recovery-rate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { UnauthenticatedError, withAccount } from "@/lib/tenancy";

const UNLOCK_COOKIE = "ka-parent-unlock";
const PIN_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

const pinSchema = z.string().regex(PIN_REGEX, "Use 4 to 6 numbers.");
const setPinSchema = z
  .object({
    pin: pinSchema,
    confirmPin: pinSchema,
  })
  .refine(({ pin, confirmPin }) => pin === confirmPin, {
    message: "Those PINs do not match.",
    path: ["confirmPin"],
  });
const passwordSchema = z
  .string()
  .min(1, "Enter your account password.")
  .max(128, "That password is too long.");

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/parent",
};

/** Verify the account-scoped PIN and grant this browser a 15-minute grace window. */
export async function verifyParentPinAction(pin: string) {
  const parsed = parseInput(pinSchema, pin, "Use 4 to 6 numbers.");
  if (!parsed.ok) return parsed;

  try {
    const requestHeaders = await headers();
    const cookieStore = await cookies();

    return await withAccount(async ({ accountId }) => {
      const ip = clientIp(requestHeaders) ?? "unknown";
      const rate = checkRateLimit(`parent-pin:${accountId}:${ip}`, PIN_RATE_LIMIT);
      if (!rate.ok) {
        return {
          ok: false as const,
          reason: "rate-limited" as const,
          message: "Too many tries.",
          retryAfterSec: rate.retryAfterSec,
        };
      }

      const now = Date.now();
      const state = await getParentPinState(accountId);
      if (state?.lockedUntil && state.lockedUntil.getTime() > now) {
        return durableLockResult(state.lockedUntil, now);
      }

      if (state && !(await verifyPin(parsed.data, state.pinHash))) {
        const failure = await recordParentPinFailure(accountId, now);
        if (failure?.lockedUntil && failure.lockedUntil.getTime() > now) {
          return durableLockResult(failure.lockedUntil, now);
        }
        return {
          ok: false as const,
          reason: "incorrect" as const,
          message: "That PIN didn’t match. Try again.",
        };
      }

      if (state) await resetParentPinFailures(accountId);
      setUnlockCookie(cookieStore, accountId, now);
      return { ok: true as const };
    });
  } catch (error) {
    return mapPinActionError(error, "parent PIN verify failed", "We could not check the PIN right now. Try again.");
  }
}

/** Set or change the current account's PIN, provided an existing lock is unlocked. */
export async function setParentPinAction(pin: string, confirmPin: string) {
  const parsed = parseInput(
    setPinSchema,
    { pin, confirmPin },
    "Check both PIN fields and try again.",
  );
  if (!parsed.ok) return parsed;

  try {
    const cookieStore = await cookies();
    const secret = getEnv("BETTER_AUTH_SECRET");

    const result = await withAccount(async ({ accountId }) => {
      const existingHash = await getParentPinHash(accountId);
      const unlockToken = cookieStore.get(UNLOCK_COOKIE)?.value;
      if (
        existingHash &&
        !verifyUnlockToken(unlockToken, accountId, Date.now(), secret)
      ) {
        return {
          ok: false as const,
          reason: "locked" as const,
          message: "Unlock the grown-up area before changing its PIN.",
        };
      }

      const derivedHash = await hashPin(parsed.data.pin);
      await setParentPin(accountId, derivedHash);
      setUnlockCookie(cookieStore, accountId, Date.now());
      return { ok: true as const };
    });

    if (result.ok) {
      revalidatePath("/parent", "layout");
      revalidatePath("/parent/settings");
    }
    return result;
  } catch (error) {
    return mapPinActionError(error, "parent PIN set failed", "We could not save the PIN right now. Try again.");
  }
}

/** Re-verify the signed-in parent's password, then remove their optional PIN lock. */
export async function clearParentPinByPasswordAction(password: string) {
  const parsed = parseInput(passwordSchema, password, "Enter your account password.");
  if (!parsed.ok) return parsed;

  try {
    const requestHeaders = await headers();
    const cookieStore = await cookies();
    const auth = getAuth();

    const result = await withAccount(async ({ accountId }) => {
      const ip = clientIp(requestHeaders) ?? "unknown";
      const rate = checkParentPinRecoveryRateLimit(accountId, ip);
      if (!rate.ok) {
        return {
          ok: false as const,
          reason: "rate-limited" as const,
          message: "Too many tries.",
          retryAfterSec: rate.retryAfterSec,
        };
      }

      try {
        await auth.api.verifyPassword({
          body: { password: parsed.data },
          headers: requestHeaders,
        });
      } catch (error) {
        if (isAPIError(error)) {
          return {
            ok: false as const,
            reason: "reauth-failed" as const,
            message: "That password didn’t match. Try again.",
          };
        }
        throw error;
      }

      await clearParentPin(accountId);
      expireUnlockCookie(cookieStore);
      return { ok: true as const };
    });

    if (result.ok) {
      revalidatePath("/parent", "layout");
      revalidatePath("/parent/settings");
    }
    return result;
  } catch (error) {
    return mapPinActionError(error, "parent PIN clear failed", "We could not remove the PIN right now. Try again.");
  }
}

function durableLockResult(lockedUntil: Date, now: number) {
  return {
    ok: false as const,
    reason: "rate-limited" as const,
    message: "Too many tries.",
    retryAfterSec: Math.max(1, Math.ceil((lockedUntil.getTime() - now) / 1000)),
  };
}

/** End the parent grace window before physically handing over a shared device. */
export async function lockParentAreaAction() {
  try {
    expireUnlockCookie(await cookies());
    return { ok: true as const };
  } catch (error) {
    return mapPinActionError(
      error,
      "parent area lock failed",
      "We could not lock the grown-up area. Try again.",
    );
  }
}

/** Preserve the standard action mapping without ever forwarding credential-bearing errors. */
function mapPinActionError(error: unknown, context: string, unavailableMessage: string) {
  const safeError =
    error instanceof UnauthenticatedError
      ? error
      : new Error("Sensitive parent PIN operation failed.");
  return mapActionError(safeError, context, unavailableMessage);
}

function setUnlockCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  accountId: string,
  now: number,
): void {
  const secret = getEnv("BETTER_AUTH_SECRET");
  cookieStore.set(UNLOCK_COOKIE, mintUnlockToken(accountId, now, secret), {
    ...cookieOptions,
    maxAge: UNLOCK_TTL_MS / 1000,
  });
}

function expireUnlockCookie(cookieStore: Awaited<ReturnType<typeof cookies>>): void {
  cookieStore.set(UNLOCK_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
