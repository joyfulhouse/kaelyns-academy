// src/lib/api/rate.ts
/**
 * Shared rate-limit key + policy selection for the API route handlers. Signed-in
 * accounts are keyed by accountId and get the (more generous) account policy;
 * anonymous callers (the public "explore" flow) are keyed + capped by client IP.
 * The per-route limits and key prefixes differ, so each route owns its constants
 * and prefix and passes them in — only the account-vs-IP selection is shared.
 * Callers run `checkRateLimit(key, policy)` and build their own 429 response.
 * Build-safe: pure selection, no service access.
 */
import type { RateLimitOptions } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import type { AccountContext } from "@/lib/tenancy";

/** Per-caller-class rate-limit policies for a route. */
export interface RateLimitPolicies {
  /** Window applied to signed-in accounts. */
  account: RateLimitOptions;
  /** Window applied to anonymous (IP-keyed) callers. */
  anon: RateLimitOptions;
}

/**
 * Pick the rate-limit key + policy for this request. `account` → `${prefix}:acct:`
 * keyed by accountId; otherwise `${prefix}:ip:` keyed by client IP (or `noip` when
 * none can be determined, so unidentified callers share a bucket rather than skip
 * the limit).
 */
export function resolveRateLimit(
  account: AccountContext | null,
  req: Request,
  prefix: string,
  policies: RateLimitPolicies,
): { key: string; policy: RateLimitOptions } {
  return account
    ? { key: `${prefix}:acct:${account.accountId}`, policy: policies.account }
    : { key: `${prefix}:ip:${clientIp(req.headers) ?? "noip"}`, policy: policies.anon };
}
