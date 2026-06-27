import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * COPPA store tests (P6): buildAccountExport (tenancy + shape) — and, from P6.5,
 * deleteAccount (the load-bearing cascade test). There is no live test DB, so —
 * mirroring the existing recordAttempt suite — these run against a hand-rolled
 * chainable fake that records every statement issued and returns canned rows per
 * table. We assert the *queries* (scoping, ordering, the audit-before-delete
 * sequence, delete target) rather than real DB effects; the actual FK cascade /
 * set-null is a property of the schema, guarded separately by an FK-shape test.
 *
 * Kept in its own file so its db/drizzle mocks don't perturb store.test.ts.
 */

interface Op {
  op: string;
  table: string;
  values?: Record<string, unknown>;
  where?: unknown;
}
const ops: Op[] = [];

// Canned rows per table for SELECTs.
const rows: Record<string, Record<string, unknown>[]> = {
  user: [],
  learner: [],
  enrollment: [],
  skill_state: [],
  attempt: [],
};
// Canned scalar count() results, consumed in order by the count selects.
const counts: number[] = [];
// Rows returned by DELETE ... RETURNING (the deleted user id).
const deleteReturning = { value: [] as Record<string, unknown>[] };

function tableName(t: unknown): string {
  return (t as { _name?: string })._name ?? "unknown";
}

/** A thenable, chainable query builder recording (op, table) and resolving rows. */
function selectChain() {
  let table = "unknown";
  let isCount = false;
  const chain = {
    _where: undefined as unknown,
    markCount(proj?: Record<string, unknown>) {
      if (proj && "value" in proj) isCount = true;
      return chain;
    },
    from(t: unknown) {
      table = tableName(t);
      return chain;
    },
    where(w?: unknown) {
      chain._where = w;
      return chain;
    },
    limit() {
      return chain;
    },
    orderBy() {
      ops.push({ op: "select.orderBy", table });
      return chain;
    },
    then<T>(resolve: (r: unknown[]) => T) {
      ops.push({ op: "select", table, where: chain._where });
      if (isCount) return Promise.resolve([{ value: counts.shift() ?? 0 }]).then(resolve);
      return Promise.resolve(rows[table] ?? []).then(resolve);
    },
  };
  return chain;
}

const tx = {
  select: (proj?: Record<string, unknown>) => selectChain().markCount(proj),
  insert(t: unknown) {
    return {
      values(v: Record<string, unknown>) {
        ops.push({ op: "insert", table: tableName(t), values: v });
        return { then: (r: () => void) => Promise.resolve().then(r) };
      },
    };
  },
  delete(t: unknown) {
    return {
      where(w?: unknown) {
        return {
          returning() {
            ops.push({ op: "delete.returning", table: tableName(t), where: w });
            return Promise.resolve(deleteReturning.value);
          },
        };
      },
    };
  },
};

const db = {
  select: (proj?: Record<string, unknown>) => selectChain().markCount(proj),
  transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
};

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/db/schema", () => ({
  user: { _name: "user", id: {}, email: {}, createdAt: {} },
  learner: { _name: "learner", id: {}, accountId: {}, createdAt: {} },
  enrollment: { _name: "enrollment", learnerId: {} },
  skillState: { _name: "skill_state", learnerId: {} },
  attempt: { _name: "attempt", learnerId: {} },
  deletionAudit: { _name: "deletion_audit" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => ["eq", ...a],
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
  count: () => ["count"],
}));

import { buildAccountExport, deleteAccount, listGeneratedAttempts } from "./store";

beforeEach(() => {
  ops.length = 0;
  counts.length = 0;
  deleteReturning.value = [];
  for (const k of Object.keys(rows)) rows[k] = [];
  db.transaction.mockClear();
});

describe("buildAccountExport (tenancy + shape)", () => {
  it("returns null when the parent user row is absent", async () => {
    rows.user = [];
    expect(await buildAccountExport("U1", "2026-06-26T00:00:00.000Z")).toBeNull();
  });

  it("reads the user row and the account's learners, both scoped by accountId", async () => {
    rows.user = [{ id: "U1", email: "p@example.com", createdAt: new Date("2026-01-01T00:00:00.000Z") }];
    rows.learner = [];
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");

    const userSel = ops.find((o) => o.op === "select" && o.table === "user");
    const learnerSel = ops.find((o) => o.op === "select" && o.table === "learner");
    expect(userSel).toBeDefined();
    expect(learnerSel).toBeDefined();
    // eq is encoded as ["eq", col, val] by the drizzle mock, so the account id
    // must appear in both predicates — i.e. both reads are account-scoped.
    expect(JSON.stringify(userSel!.where)).toContain("U1");
    expect(JSON.stringify(learnerSel!.where)).toContain("U1");
  });

  it("assembles a minimized account node + one learner export per owned learner", async () => {
    rows.user = [{ id: "U1", email: "p@example.com", createdAt: new Date("2026-01-01T00:00:00.000Z") }];
    rows.learner = [
      { id: "L1", displayName: "A", birthMonth: null, settings: {}, createdAt: new Date() },
      { id: "L2", displayName: "B", birthMonth: "May", settings: { aiPractice: false }, createdAt: new Date() },
    ];
    const result = await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.account).toEqual({
      id: "U1",
      email: "p@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result!.learners.map((l) => l.learner.id)).toEqual(["L1", "L2"]);
    expect(result!.manifest.contents).toContain("aiProvenance");
  });
});

describe("deleteAccount (cascade + audit)", () => {
  beforeEach(() => {
    // Default: 2 learners, 5 attempts; the user delete affects 1 row.
    // deleteAccount issues: count(learner)=2, then select learner ids (2 rows),
    // then count(attempt)=5 — so seed both the learner id-rows and the counts.
    rows.learner = [{ id: "L1" }, { id: "L2" }];
    counts.push(2, 5);
    deleteReturning.value = [{ id: "U1" }];
  });

  it("writes the deletion_audit row BEFORE deleting the user (audit survives cascade)", async () => {
    await deleteAccount("U1");
    const auditIdx = ops.findIndex((o) => o.op === "insert" && o.table === "deletion_audit");
    const deleteIdx = ops.findIndex((o) => o.op === "delete.returning" && o.table === "user");
    expect(auditIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(auditIdx).toBeLessThan(deleteIdx);
  });

  it("records the learner + attempt counts and requestedBy on the audit row", async () => {
    await deleteAccount("U1");
    const audit = ops.find((o) => o.op === "insert" && o.table === "deletion_audit");
    expect(audit?.values).toMatchObject({
      userId: "U1",
      learnerCount: 2,
      attemptCount: 5,
      requestedBy: "parent",
    });
  });

  it("deletes by the user id (the single statement the FK cascade hangs off)", async () => {
    await deleteAccount("U1");
    const del = ops.find((o) => o.op === "delete.returning" && o.table === "user");
    expect(del).toBeDefined();
    expect(JSON.stringify(del!.where)).toContain("U1");
  });

  it("runs inside one transaction and returns the deleted counts", async () => {
    const result = await deleteAccount("U1");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: true, deletedLearners: 2, deletedAttempts: 5 });
  });

  it("returns deleted:false when no user row matched (already gone)", async () => {
    deleteReturning.value = [];
    const result = await deleteAccount("U1");
    expect(result.deleted).toBe(false);
  });
});

describe("listGeneratedAttempts (provenance read)", () => {
  // The ownership check (getLearner) reads rows.learner; an owned learner row
  // must carry the columns toRow maps.
  const owned = { id: "L1", accountId: "U1", displayName: "Kaelyn", avatar: null, birthMonth: null };

  function genRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      activityId: "gen-a",
      kind: "math-tenframe",
      score: { stars: 2, correct: 2, total: 3, skillEvidence: [] },
      genModel: "ha-assist",
      genRoute: "ready",
      genAt: new Date("2026-06-26T08:00:00.000Z"),
      createdAt: new Date("2026-06-26T08:00:01.000Z"),
      ...over,
    };
  }

  it("returns an empty page when the learner is not owned by the account", async () => {
    rows.learner = []; // ownership fails
    const page = await listGeneratedAttempts("U1", "L1");
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("maps generated rows to provenance items (model/route/generatedAt/stars)", async () => {
    rows.learner = [owned];
    rows.attempt = [genRow()];
    const page = await listGeneratedAttempts("U1", "L1");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      activityId: "gen-a",
      kind: "math-tenframe",
      stars: 2,
      model: "ha-assist",
      route: "ready",
      generatedAt: "2026-06-26T08:00:00.000Z",
      createdAt: "2026-06-26T08:00:01.000Z",
    });
  });

  it("paginates with a nextCursor when more than `limit` rows exist (limit+1 probe)", async () => {
    rows.learner = [owned];
    // limit=2, provide 3 rows → store slices to 2 and sets nextCursor to row 2's createdAt.
    rows.attempt = [
      genRow({ createdAt: new Date("2026-06-26T03:00:00.000Z") }),
      genRow({ createdAt: new Date("2026-06-26T02:00:00.000Z") }),
      genRow({ createdAt: new Date("2026-06-26T01:00:00.000Z") }),
    ];
    const page = await listGeneratedAttempts("U1", "L1", { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("2026-06-26T02:00:00.000Z");
  });

  it("has a null nextCursor when the page is not full (no further page)", async () => {
    rows.learner = [owned];
    rows.attempt = [genRow()];
    const page = await listGeneratedAttempts("U1", "L1", { limit: 20 });
    expect(page.nextCursor).toBeNull();
  });

  it("carries null model/route/generatedAt through for a pre-provenance generated row", async () => {
    rows.learner = [owned];
    rows.attempt = [genRow({ genModel: null, genRoute: null, genAt: null })];
    const page = await listGeneratedAttempts("U1", "L1");
    expect(page.items[0]).toMatchObject({ model: null, route: null, generatedAt: null });
  });
});
