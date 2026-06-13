import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

/**
 * The tenancy seam. Every learner-scoped read/write should run inside
 * `withAccount()` so a parent can only ever touch their own account's data.
 *
 * Today an "account" is 1:1 with the Better Auth user (one parent = one
 * account); `accountId` is intentionally distinct from `userId` so that when a
 * real `account` table lands (multiple guardians per account, see spec §8) the
 * call sites do not change, only the resolution below.
 *
 * Build-safe: `getAuth()` is lazy and only invoked per-request here, never at
 * module-evaluation time.
 */

export interface AccountContext {
  /** Scope key for all learner data. Currently equals userId; see TODO. */
  accountId: string;
  /** The signed-in Better Auth user. */
  userId: string;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Resolve the current account context from the request session.
 * @throws {UnauthenticatedError} when there is no valid session.
 */
export async function requireAccount(): Promise<AccountContext> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthenticatedError();

  // TODO(P6): resolve the real account id once an `account` table (and
  // account_member join) exists. Until then a parent account is their user.
  return { accountId: session.user.id, userId: session.user.id };
}

/**
 * Run `fn` with the current account context, scoping any learner queries to
 * that account. Throws {@link UnauthenticatedError} if there is no session.
 *
 * @example
 *   const learners = await withAccount(({ accountId }) =>
 *     // TODO(P6): getDb().select().from(learner).where(eq(learner.accountId, accountId))
 *     listLearners(accountId),
 *   );
 */
export async function withAccount<T>(
  fn: (ctx: AccountContext) => Promise<T> | T,
): Promise<T> {
  const ctx = await requireAccount();
  return fn(ctx);
}
