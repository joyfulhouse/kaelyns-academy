import { describe, it, expect, vi, beforeEach } from "vitest";

// purchaseSticker's atomicity is exercised against a hand-rolled fake `tx` (there
// is no live test DB; see store.test.ts for the pattern this copies). The fake
// records every statement so a test can assert: the learner row is locked FOR
// UPDATE first (ownership + serialization point), the sticker+pack validation
// and owned-check run before any write, and the spend + grant land together.
const ops: { op: string; table: string }[] = [];
// The values() payload of each `star_ledger` insert — the spend half of the
// atomic purchase (delta/reason/refId).
const ledgerInserts: Record<string, unknown>[] = [];
// The values() payload of each `learner_sticker` insert — the grant half.
const ownedInserts: Record<string, unknown>[] = [];
// Mutable canned rows the fake `tx` returns for each select target.
const learnerRows = { value: [{ id: "L1" }] as Record<string, unknown>[] };
const stickerRows = { value: [] as Record<string, unknown>[] };
const ownedRows = { value: [] as Record<string, unknown>[] };
const ledgerRows = { value: [] as Record<string, unknown>[] };

function tableName(t: unknown): string {
  return (t as { _name?: string })._name ?? "unknown";
}

/** A thenable query builder: chainable methods return `this`; awaiting it
 *  records the (op, table) and resolves to the canned rows for that target. */
function builder(op: string, table: string) {
  const chain = {
    op,
    table,
    from(t: unknown) {
      chain.table = tableName(t);
      return chain;
    },
    innerJoin() {
      return chain;
    },
    where() {
      return chain;
    },
    values(v?: Record<string, unknown>) {
      if (chain.op === "insert" && chain.table === "star_ledger" && v) {
        ledgerInserts.push(v);
      }
      if (chain.op === "insert" && chain.table === "learner_sticker" && v) {
        ownedInserts.push(v);
      }
      return chain;
    },
    limit() {
      return chain;
    },
    for() {
      ops.push({ op: "select.for", table: chain.table });
      return chain;
    },
    then<T>(resolve: (rows: unknown[]) => T) {
      ops.push({ op: chain.op, table: chain.table });
      const rows =
        chain.op === "select" && chain.table === "learner"
          ? learnerRows.value
          : chain.op === "select" && chain.table === "sticker"
            ? stickerRows.value
            : chain.op === "select" && chain.table === "learner_sticker"
              ? ownedRows.value
              : chain.op === "select" && chain.table === "star_ledger"
                ? ledgerRows.value
                : [];
      return Promise.resolve(rows).then(resolve);
    },
  };
  return chain;
}

const tx = {
  select(_proj?: unknown) {
    return builder("select", "unknown");
  },
  insert(t: unknown) {
    return builder("insert", tableName(t));
  },
};

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

vi.mock("@/lib/db", () => ({ getDb: () => ({ transaction }) }));
vi.mock("@/lib/db/schema", () => ({
  learner: { _name: "learner", id: {}, accountId: {} },
  sticker: { _name: "sticker", id: {}, packId: {}, starCost: {} },
  stickerPack: { _name: "sticker_pack", id: {}, status: {}, slug: {}, title: {}, theme: {}, sortKey: {} },
  learnerSticker: { _name: "learner_sticker", id: {}, learnerId: {}, stickerId: {} },
  starLedger: { _name: "star_ledger", learnerId: {}, delta: {}, reason: {}, refId: {} },
}));
// drizzle-orm operators are used only to build opaque predicate objects here.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  asc: (a: unknown) => a,
  eq: (...a: unknown[]) => a,
}));

import { purchaseSticker } from "./stickers";

describe("purchaseSticker (atomic spend + grant)", () => {
  beforeEach(() => {
    ops.length = 0;
    ledgerInserts.length = 0;
    ownedInserts.length = 0;
    transaction.mockClear();
    learnerRows.value = [{ id: "L1" }];
    stickerRows.value = [];
    ownedRows.value = [];
    ledgerRows.value = [];
  });

  it("purchases atomically: lock, balance check, spend + grant in one tx", async () => {
    stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
    ledgerRows.value = [{ delta: 8 }];
    const result = await purchaseSticker("A1", "L1", "S1");
    expect(result).toEqual({ ok: true });
    expect(ops).toContainEqual({ op: "select.for", table: "learner" }); // row lock first
    expect(ledgerInserts).toEqual([
      expect.objectContaining({ delta: -5, reason: "sticker_purchase", refId: "S1" }),
    ]);
    expect(ownedInserts).toHaveLength(1);
  });

  it("rejects when balance is insufficient (nothing written)", async () => {
    stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
    ledgerRows.value = [{ delta: 3 }];
    expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "insufficient" });
    expect(ledgerInserts).toHaveLength(0);
  });

  it("rejects an unpublished pack's sticker as not_found", async () => {
    stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "draft" }];
    expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects a duplicate as already_owned", async () => {
    stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
    ownedRows.value = [{ id: "existing" }];
    ledgerRows.value = [{ delta: 8 }];
    expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "already_owned" });
  });

  it("rejects a learner not owned by the account as not_found (no writes)", async () => {
    learnerRows.value = [];
    stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
    ledgerRows.value = [{ delta: 8 }];
    expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "not_found" });
    expect(ledgerInserts).toHaveLength(0);
    expect(ownedInserts).toHaveLength(0);
  });
});
