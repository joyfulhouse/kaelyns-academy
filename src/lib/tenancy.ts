import { getSessionOrNull } from "@/lib/auth";

/**
 * The tenancy seam. Every learner-scoped read/write should run inside
 * `withAccount()` so a parent can only ever touch their own account's data.
 *
 * Today an "account" is 1:1 with the Better Auth user (one parent = one
 * account); `accountId` is intentionally distinct from `userId` so that when a
 * real `account` table lands (multiple guardians per account, see spec §8) the
 * call sites do not change, only the resolution below.
 *
 * Build-safe: session resolution (`getSessionOrNull` → lazy `getAuth()`) only
 * runs per-request here, never at module-evaluation time.
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
  const session = await getSessionOrNull();
  if (!session?.user) throw new UnauthenticatedError();

  // TODO(P6): resolve the real account id once an `account` table (and
  // account_member join) exists. Until then a parent account is their user.
  return { accountId: session.user.id, userId: session.user.id };
}

/**
 * Resolve the current account context, or `null` when there is no valid session.
 * The no-throw variant for routes that serve both signed-in and anonymous
 * callers (e.g. the public "explore" learner flow), where being unauthenticated
 * is expected rather than an error.
 */
export async function getAccountOrNull(): Promise<AccountContext | null> {
  try {
    return await requireAccount();
  } catch (error) {
    if (error instanceof UnauthenticatedError) return null;
    throw error;
  }
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
