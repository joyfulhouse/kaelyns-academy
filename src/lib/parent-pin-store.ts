import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { parentPin } from "@/lib/db/schema";
import { nextParentPinFailure } from "@/lib/parent-pin";

export interface ParentPinState {
  pinHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface ParentPinFailureState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** Read the current account's derived PIN hash, or null when no lock is set. */
export async function getParentPinHash(accountId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ pinHash: parentPin.pinHash })
    .from(parentPin)
    .where(eq(parentPin.accountId, accountId))
    .limit(1);
  return rows[0]?.pinHash ?? null;
}

/** Read the hash and cluster-wide attempt state used by PIN verification. */
export async function getParentPinState(accountId: string): Promise<ParentPinState | null> {
  const rows = await getDb()
    .select({
      pinHash: parentPin.pinHash,
      failedAttempts: parentPin.failedAttempts,
      lockedUntil: parentPin.lockedUntil,
    })
    .from(parentPin)
    .where(eq(parentPin.accountId, accountId))
    .limit(1);
  return rows[0] ?? null;
}

/** Insert or replace one account's derived PIN hash. */
export async function setParentPin(accountId: string, pinHash: string): Promise<void> {
  const updatedAt = new Date();
  await getDb()
    .insert(parentPin)
    .values({ accountId, pinHash, failedAttempts: 0, lockedUntil: null, updatedAt })
    .onConflictDoUpdate({
      target: parentPin.accountId,
      set: { pinHash, failedAttempts: 0, lockedUntil: null, updatedAt },
    });
}

/**
 * Serialize failures on the account row so every pod observes one budget.
 * `FOR UPDATE` prevents concurrent requests from losing increments or replacing
 * a longer cooldown with a shorter one.
 */
export async function recordParentPinFailure(
  accountId: string,
  now: number,
): Promise<ParentPinFailureState | null> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ failedAttempts: parentPin.failedAttempts })
      .from(parentPin)
      .where(eq(parentPin.accountId, accountId))
      .limit(1)
      .for("update");
    const current = rows[0];
    if (!current) return null;

    const next = nextParentPinFailure(current.failedAttempts, now);
    const lockedUntil = next.lockedUntil === null ? null : new Date(next.lockedUntil);
    await tx
      .update(parentPin)
      .set({ failedAttempts: next.failedAttempts, lockedUntil })
      .where(eq(parentPin.accountId, accountId));

    return { failedAttempts: next.failedAttempts, lockedUntil };
  });
}

/** Reset the durable budget only after a successful PIN verification. */
export async function resetParentPinFailures(accountId: string): Promise<void> {
  await getDb()
    .update(parentPin)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(parentPin.accountId, accountId));
}

/** Clear only the matching account's lock row. */
export async function clearParentPin(accountId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(parentPin)
    .where(eq(parentPin.accountId, accountId))
    .returning({ accountId: parentPin.accountId });
  return rows.length > 0;
}
