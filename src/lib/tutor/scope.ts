// server-only: this module opens DB connections (getLearner) and must never be
// imported into a Client Component. Shared by the tutor store and the parent read
// layer so the account-ownership (tenancy) gate is written once.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { learner } from "@/lib/db/schema";

/**
 * A learner profile row, projected to the fields the tutor + parent surfaces use.
 * Child PII is minimized to a display name + birth month (spec §8). `accountId`
 * is the owning Better Auth user — every learner read/write is scoped to it.
 */
export interface LearnerRow {
  id: string;
  accountId: string;
  displayName: string;
  avatar: string | null;
  birthMonth: string | null;
}

/** Project a raw learner row into the minimized {@link LearnerRow}. */
export function toLearnerRow(r: typeof learner.$inferSelect): LearnerRow {
  return {
    id: r.id,
    accountId: r.accountId,
    displayName: r.displayName,
    avatar: r.avatar,
    birthMonth: r.birthMonth,
  };
}

/** Scoped fetch: returns null if the learner doesn't exist OR isn't this account's. */
export async function getLearner(accountId: string, learnerId: string): Promise<LearnerRow | null> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  return rows[0] ? toLearnerRow(rows[0]) : null;
}

/**
 * Tenancy gate (spec §7): resolve the learner the account owns, then run `fn`
 * with it. When the learner does not exist or is not this account's, return
 * `fallback` UNCHANGED — never another account's data, never `fn`'s work.
 *
 * The fallback is passed per call site because the not-owned answer differs by
 * read (`[]`, `{}`, `null`, a zeroed count map). Routing every owned-check
 * through here keeps each site fail-closed to the SAME empty value it already
 * returned, so the consolidation cannot weaken a §8 boundary.
 */
export async function withOwnedLearner<T>(
  accountId: string,
  learnerId: string,
  fn: (owned: LearnerRow) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return fallback;
  return fn(owned);
}
