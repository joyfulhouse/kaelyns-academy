import { beforeEach, describe, expect, it, vi } from "vitest";

interface TestRow {
  pinHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
}

const rows = new Map<string, TestRow>();

vi.mock("@/lib/db/schema", () => ({
  parentPin: {
    _name: "parent_pin",
    accountId: { name: "account_id" },
    pinHash: { name: "pin_hash" },
    failedAttempts: { name: "failed_attempts" },
    lockedUntil: { name: "locked_until" },
    updatedAt: { name: "updated_at" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_column: unknown, value: string) => ({ value }),
}));

vi.mock("@/lib/db", () => {
  const select = () => ({
    from: () => ({
      where: (condition: { value: string }) => ({
        limit: () => {
          const row = rows.get(condition.value);
          const result = row ? [{ ...row }] : [];
          const pending = Promise.resolve(result) as Promise<TestRow[]> & {
            for: () => Promise<TestRow[]>;
          };
          pending.for = async () => result;
          return pending;
        },
      }),
    }),
  });
  const update = () => ({
    set: (value: Partial<TestRow>) => ({
      where: async (condition: { value: string }) => {
        const current = rows.get(condition.value);
        if (current) rows.set(condition.value, { ...current, ...value });
      },
    }),
  });
  const transactionDb = { select, update };

  return {
    getDb: () => ({
      select,
      insert: () => ({
        values: (value: {
          accountId: string;
          pinHash: string;
          failedAttempts: number;
          lockedUntil: Date | null;
        }) => ({
          onConflictDoUpdate: async () => {
            rows.set(value.accountId, {
              pinHash: value.pinHash,
              failedAttempts: value.failedAttempts,
              lockedUntil: value.lockedUntil,
            });
          },
        }),
      }),
      update,
      delete: () => ({
        where: (condition: { value: string }) => ({
          returning: async () => {
            const existed = rows.delete(condition.value);
            return existed ? [{ accountId: condition.value }] : [];
          },
        }),
      }),
      transaction: async <T>(fn: (tx: typeof transactionDb) => Promise<T>) => fn(transactionDb),
    }),
  };
});

const {
  clearParentPin,
  getParentPinHash,
  getParentPinState,
  recordParentPinFailure,
  resetParentPinFailures,
  setParentPin,
} = await import("./parent-pin-store");

beforeEach(() => rows.clear());

describe("parent PIN store tenancy", () => {
  it("reads and updates only the requested account row", async () => {
    await setParentPin("account-1", "hash-1");
    await setParentPin("account-2", "hash-2");

    expect(await getParentPinHash("account-1")).toBe("hash-1");
    expect(await getParentPinHash("account-2")).toBe("hash-2");
  });

  it("does not clear another account when given the wrong account id", async () => {
    await setParentPin("account-1", "hash-1");

    await expect(clearParentPin("account-2")).resolves.toBe(false);
    await expect(getParentPinHash("account-1")).resolves.toBe("hash-1");
  });

  it("clears the matching account and reports whether a row changed", async () => {
    await setParentPin("account-1", "hash-1");

    await expect(clearParentPin("account-1")).resolves.toBe(true);
    await expect(getParentPinHash("account-1")).resolves.toBeNull();
  });

  it("persists threshold lockout state and resets it after success", async () => {
    const now = 1_700_000_000_000;
    await setParentPin("account-1", "hash-1");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordParentPinFailure("account-1", now);
    }
    await expect(recordParentPinFailure("account-1", now)).resolves.toEqual({
      failedAttempts: 5,
      lockedUntil: new Date(now + 60_000),
    });

    await resetParentPinFailures("account-1");
    await expect(getParentPinState("account-1")).resolves.toEqual({
      pinHash: "hash-1",
      failedAttempts: 0,
      lockedUntil: null,
    });
  });
});
