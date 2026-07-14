import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { verifyUnlockToken } from "@/lib/parent-pin";
import { getParentPinHash } from "@/lib/parent-pin-store";
import { requireAccount, type AccountContext } from "@/lib/tenancy";

/** Expected authorization signal for a signed-in but PIN-locked parent request. */
export class ParentAreaLockedError extends Error {
  constructor() {
    super("Parent area is locked");
    this.name = "ParentAreaLockedError";
  }
}

/**
 * Resolve the request-time PIN gate outside React render. The wall-clock read is
 * intentionally here: token expiry is request state, while the layout remains
 * an idempotent projection of this boolean for React's purity contract.
 */
export async function parentPinRequiresChallenge(accountId: string): Promise<boolean> {
  const pinHash = await getParentPinHash(accountId);
  if (!pinHash) return false;

  const token = (await cookies()).get("ka-parent-unlock")?.value;
  return !verifyUnlockToken(
    token,
    accountId,
    Date.now(),
    getEnv("BETTER_AUTH_SECRET"),
  );
}

/**
 * Run a parent-surface operation only after both session and current-device PIN
 * authorization succeed. Server Actions are directly POST-able RPC endpoints,
 * so the layout gate alone is not an authorization boundary.
 */
export async function withUnlockedAccount<T>(
  fn: (ctx: AccountContext) => Promise<T> | T,
  options?: { lockedFallback: () => Promise<T> | T },
): Promise<T> {
  const ctx = await requireAccount();
  if (await parentPinRequiresChallenge(ctx.accountId)) {
    if (options) return options.lockedFallback();
    throw new ParentAreaLockedError();
  }
  return fn(ctx);
}
