// server-only: opens DB connections; import from server actions / route handlers only.
import { desc, eq, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { starLedger } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";

export interface LedgerEntry {
  delta: number;
  reason: string;
  refId: string | null;
  createdAt: string;
}

/** Current balance = sum(delta) over the learner's ledger (account-scoped). */
export async function getStarBalance(accountId: string, learnerId: string): Promise<number> {
  return withOwnedLearner<number>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ total: sum(starLedger.delta) })
        .from(starLedger)
        .where(eq(starLedger.learnerId, learnerId));
      return Number(rows[0]?.total ?? 0);
    },
    0,
  );
}

/** Newest-first ledger page for the parent Rewards panel. */
export async function listStarLedger(
  accountId: string,
  learnerId: string,
  limit = 50,
): Promise<LedgerEntry[]> {
  return withOwnedLearner<LedgerEntry[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(starLedger)
        .where(eq(starLedger.learnerId, learnerId))
        .orderBy(desc(starLedger.createdAt))
        .limit(Math.max(1, Math.min(200, limit)));
      return rows.map((r) => ({
        delta: r.delta,
        reason: r.reason,
        refId: r.refId,
        createdAt: r.createdAt.toISOString(),
      }));
    },
    [],
  );
}

/** Parent "offline win" bonus (spec §5): a bounded manual adjustment. */
export async function grantBonusStars(
  accountId: string,
  learnerId: string,
  amount: number,
): Promise<boolean> {
  const bounded = Math.trunc(amount);
  if (bounded < 1 || bounded > 20) return false;
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      await getDb()
        .insert(starLedger)
        .values({ learnerId, delta: bounded, reason: "adjustment", refId: null });
      return true;
    },
    false,
  );
}
