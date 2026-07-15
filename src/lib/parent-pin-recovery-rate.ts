import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";

const PIN_RECOVERY_RATE_LIMIT = { limit: 5, windowMs: 5 * 60_000 };

/** Share one account+IP password-KDF budget across PIN recovery operations. */
export function checkParentPinRecoveryRateLimit(
  accountId: string,
  ip: string,
): RateLimitResult {
  return checkRateLimit(`parent-pin-recovery:${accountId}:${ip}`, PIN_RECOVERY_RATE_LIMIT);
}
