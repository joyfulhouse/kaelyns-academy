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
  /** Recorded by `.limit(n)` — the `select.limit` op's bound. */
  limit?: number;
  /** Recorded by `.orderBy(...)` — the (identity-mapped, via the drizzle-orm
   *  mock's `desc`) column refs, in call order — so a test can assert both the
   *  number of orderBy columns and which columns they are. */
  cols?: unknown[];
}
const ops: Op[] = [];

// Canned rows per table for SELECTs.
const rows: Record<string, Record<string, unknown>[]> = {
  user: [],
  learner: [],
  enrollment: [],
  skill_state: [],
  review_schedule: [],
  attempt: [],
  star_ledger: [],
  learner_sticker: [],
  learner_interest: [],
  learner_quest: [],
  checkpoint_result: [],
  generated_activity: [],
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
    innerJoin() {
      // No-op passthrough (e.g. the learner_interest ⨝ interest read in
      // gatherLearnerExport) — the fake resolves canned rows per `table`
      // (the FROM target), never actually joins.
      return chain;
    },
    where(w?: unknown) {
      chain._where = w;
      return chain;
    },
    // Bounds/ordering regression net (review finding): record the actual
    // `.limit(n)` bound and `.orderBy(...)` column shape per table, so a test
    // can assert them directly instead of only exercising the read.
    limit(n?: number) {
      ops.push({ op: "select.limit", table, limit: n });
      return chain;
    },
    orderBy(...cols: unknown[]) {
      ops.push({ op: "select.orderBy", table, cols });
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
          // A `.where()`-terminated delete (no `.returning()`) is awaited directly;
          // record it as a plain delete so the verification cleanup is observable.
          then<T>(resolve: (r: unknown) => T) {
            ops.push({ op: "delete", table: tableName(t), where: w });
            return Promise.resolve({ count: 0 }).then(resolve);
          },
        };
      },
    };
  },
};

const db = {
  select: (proj?: Record<string, unknown>) => selectChain().markCount(proj),
  transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  // deleteLearner issues its delete directly on getDb() (no transaction), unlike
  // deleteAccount's tx-scoped delete — so the top-level db needs its own `delete`.
  delete: tx.delete,
};

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/db/schema", () => ({
  user: { _name: "user", id: {}, email: {}, createdAt: {} },
  learner: { _name: "learner", id: {}, accountId: {}, createdAt: {} },
  enrollment: { _name: "enrollment", learnerId: {} },
  skillState: { _name: "skill_state", learnerId: {} },
  reviewSchedule: { _name: "review_schedule", learnerId: {} },
  attempt: { _name: "attempt", learnerId: {} },
  deletionAudit: { _name: "deletion_audit" },
  verification: { _name: "verification", identifier: {}, value: {} },
  starLedger: { _name: "star_ledger", learnerId: {}, delta: {}, createdAt: {} },
  learnerSticker: { _name: "learner_sticker", learnerId: {} },
  interest: { _name: "interest", id: {}, slug: {} },
  learnerInterest: { _name: "learner_interest", learnerId: {}, interestId: {}, source: {} },
  learnerQuest: { _name: "learner_quest", learnerId: {}, assignedOn: {}, updatedAt: {} },
  checkpointResult: { _name: "checkpoint_result", learnerId: {}, createdAt: {} },
  generatedActivity: { _name: "generated_activity", learnerId: {}, createdAt: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  or: (...a: unknown[]) => ["or", ...a],
  eq: (...a: unknown[]) => ["eq", ...a],
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
  count: () => ["count"],
  sum: (a: unknown) => ["sum", a],
}));

import {
  buildAccountExport,
  buildLearnerExport,
  deleteAccount,
  deleteLearner,
  listGeneratedAttempts,
} from "./store";
// The (mocked) schema table refs themselves, so the orderBy assertions below can
// compare by reference against what gatherLearnerExport actually passed to
// `.orderBy(...)` — not just count columns, which would pass even if the wrong
// column were swapped in.
import { checkpointResult, generatedActivity, learnerQuest, starLedger } from "@/lib/db/schema";

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

// Regression net for a review finding: nothing previously asserted the export
// reads' `.limit(...)` bounds or `.orderBy(...)` shape, so a future edit could
// silently drop either (unbounded read, or non-deterministic pagination at the
// boundary) and the suite would still pass. buildAccountExport exercises
// gatherLearnerExport (the reads live there, unexported) for one owned learner.
describe("gatherLearnerExport bounds + ordering (via buildAccountExport)", () => {
  beforeEach(() => {
    rows.user = [{ id: "U1", email: "p@example.com", createdAt: new Date("2026-01-01T00:00:00.000Z") }];
    rows.learner = [{ id: "L1", displayName: "A", birthMonth: null, settings: {}, createdAt: new Date() }];
  });

  it("bounds the star_ledger detail read to limit 500", async () => {
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    const ledgerLimit = ops.find((o) => o.op === "select.limit" && o.table === "star_ledger");
    expect(ledgerLimit?.limit).toBe(500);
  });

  it("bounds the learner_quest read to limit 200", async () => {
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    const questLimit = ops.find((o) => o.op === "select.limit" && o.table === "learner_quest");
    expect(questLimit?.limit).toBe(200);
  });

  it("orders the learner_quest read by assignedOn desc, THEN updatedAt desc — the tiebreaker for legal same-day assignedOn ties (assignedOn is a day-granularity `date` column, so ordering by it alone leaves the 200-row boundary non-deterministic)", async () => {
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    const questOrder = ops.find((o) => o.op === "select.orderBy" && o.table === "learner_quest");
    expect(questOrder?.cols).toEqual([learnerQuest.assignedOn, learnerQuest.updatedAt]);
  });

  it("orders the star_ledger detail read by createdAt desc (already a timestamptz — no same-key tiebreak needed)", async () => {
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    const ledgerOrder = ops.find((o) => o.op === "select.orderBy" && o.table === "star_ledger");
    expect(ledgerOrder?.cols).toEqual([starLedger.createdAt]);
  });

  it("orders the checkpoint_result read by createdAt desc (Adventure 2.0 C1, Task 6)", async () => {
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    const checkpointOrder = ops.find((o) => o.op === "select.orderBy" && o.table === "checkpoint_result");
    expect(checkpointOrder?.cols).toEqual([checkpointResult.createdAt]);
  });

  it("orders the generated_activity read by createdAt desc (Adventure 2.0 B3, Task 6)", async () => {
    await buildAccountExport("U1", "2026-06-26T00:00:00.000Z");
    const genOrder = ops.find((o) => o.op === "select.orderBy" && o.table === "generated_activity");
    expect(genOrder?.cols).toEqual([generatedActivity.createdAt]);
  });
});

// COPPA round-trip for the checkpoint_result table (Task 6): the export must
// carry a learner's checkpoint results, and deleting the learner must remove
// them (via the FK cascade asserted separately in schema.test.ts).
describe("checkpoint_result COPPA round-trip (buildLearnerExport + deleteLearner)", () => {
  const owned = { id: "L1", accountId: "U1", displayName: "A", birthMonth: null, settings: {}, createdAt: new Date() };

  it("buildLearnerExport includes the learner's checkpoint_result rows", async () => {
    rows.learner = [owned];
    rows.checkpoint_result = [
      {
        unitId: "reading-baseline",
        phase: "baseline",
        scores: { "rs.a": 0.8 },
        status: "applied",
        createdAt: new Date("2026-06-15T09:00:00.000Z"),
      },
    ];
    const result = await buildLearnerExport("U1", "L1", "2026-06-26T00:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.checkpointResults).toEqual([
      {
        unitId: "reading-baseline",
        phase: "baseline",
        scores: { "rs.a": 0.8 },
        status: "applied",
        createdAt: "2026-06-15T09:00:00.000Z",
      },
    ]);
  });

  it("buildLearnerExport returns null when the learner is not owned by the account (tenancy)", async () => {
    rows.learner = [];
    const result = await buildLearnerExport("U1", "L1", "2026-06-26T00:00:00.000Z");
    expect(result).toBeNull();
  });

  it("deleteLearner deletes the learner scoped by (id, accountId) — the single statement checkpoint_result's FK cascade hangs off", async () => {
    rows.learner = [owned];
    deleteReturning.value = [{ id: "L1" }];
    const deleted = await deleteLearner("U1", "L1");
    expect(deleted).toBe(true);
    const del = ops.find((o) => o.op === "delete.returning" && o.table === "learner");
    expect(del).toBeDefined();
    expect(JSON.stringify(del!.where)).toContain("L1");
    expect(JSON.stringify(del!.where)).toContain("U1");
  });

  it("deleteLearner returns false when not owned by the account (no delete)", async () => {
    deleteReturning.value = [];
    const deleted = await deleteLearner("U1", "L1");
    expect(deleted).toBe(false);
  });
});

describe("review_schedule COPPA round-trip (buildLearnerExport)", () => {
  const owned = {
    id: "L1",
    accountId: "U1",
    displayName: "A",
    birthMonth: null,
    settings: {},
    createdAt: new Date(),
  };

  it("includes the learner's skill ids and review dates", async () => {
    rows.learner = [owned];
    rows.review_schedule = [
      {
        skill: "math.add",
        programSlug: "kaelyn-adaptive",
        intervalIndex: 2,
        nextReviewOn: "2026-07-20",
        lastReviewedOn: "2026-07-13",
        lastOutcome: "solid",
      },
    ];

    const result = await buildLearnerExport("U1", "L1", "2026-07-13T00:00:00.000Z");

    expect(result).not.toBeNull();
    expect(result!.reviewSchedules).toEqual(rows.review_schedule);
  });
});

// COPPA round-trip for the generated_activity table (Adventure 2.0 B3, Task 6):
// the export must carry a learner's AI-generated shelf items with full generation
// provenance, and deleting the learner must remove them (via the FK cascade
// asserted separately in schema.test.ts's cascade map).
describe("generated_activity COPPA round-trip (buildLearnerExport + deleteLearner)", () => {
  const owned = { id: "L1", accountId: "U1", displayName: "A", birthMonth: null, settings: {}, createdAt: new Date() };

  it("buildLearnerExport includes the learner's generated_activity rows with provenance", async () => {
    rows.learner = [owned];
    rows.generated_activity = [
      {
        programVersionId: "version-1",
        unitKey: "unit-life-skills-math",
        lessonId: "lesson-counting-coins",
        kind: "math-tenframe",
        title: "Coin Count",
        config: { a: 1 },
        skillTags: ["math.count"],
        genModel: "ha-assist",
        genRoute: "ready",
        genAt: new Date("2026-06-26T08:00:00.000Z"),
        createdAt: new Date("2026-06-26T08:00:01.000Z"),
      },
    ];
    const result = await buildLearnerExport("U1", "L1", "2026-06-26T00:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.generatedActivities).toEqual([
      {
        programVersionId: "version-1",
        unitKey: "unit-life-skills-math",
        lessonId: "lesson-counting-coins",
        kind: "math-tenframe",
        title: "Coin Count",
        config: { a: 1 },
        skillTags: ["math.count"],
        genModel: "ha-assist",
        genRoute: "ready",
        genAt: "2026-06-26T08:00:00.000Z",
        createdAt: "2026-06-26T08:00:01.000Z",
      },
    ]);
  });

  it("deleteLearner deletes the learner scoped by (id, accountId) — the single statement generated_activity's FK cascade hangs off", async () => {
    rows.learner = [owned];
    deleteReturning.value = [{ id: "L1" }];
    const deleted = await deleteLearner("U1", "L1");
    expect(deleted).toBe(true);
    const del = ops.find((o) => o.op === "delete.returning" && o.table === "learner");
    expect(del).toBeDefined();
    expect(JSON.stringify(del!.where)).toContain("L1");
    expect(JSON.stringify(del!.where)).toContain("U1");
  });

  it("export carries no generated_activity rows once the cascade has removed them (post-delete emptiness)", async () => {
    rows.learner = [owned];
    // After the learner delete, the FK cascade has removed every generated_activity
    // row — model that here by leaving the table empty; the export shows an empty shelf.
    rows.generated_activity = [];
    const result = await buildLearnerExport("U1", "L1", "2026-06-26T00:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.generatedActivities).toEqual([]);
  });
});

describe("deleteAccount (cascade + audit)", () => {
  beforeEach(() => {
    // Default: 2 learners, 5 attempts; the user delete affects 1 row.
    // deleteAccount issues: count(learner)=2, then select learner ids (2 rows),
    // then count(attempt)=5 — so seed both the learner id-rows and the counts.
    // The email select (for verification cleanup) reads rows.user.
    rows.user = [{ id: "U1", email: "p@example.com" }];
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

  it("deletes the parent's Better Auth verification rows (no FK → cascade misses them)", async () => {
    await deleteAccount("U1");
    const vDel = ops.find((o) => o.op === "delete" && o.table === "verification");
    expect(vDel).toBeDefined();
    // Matches BOTH Better Auth key shapes: identifier=email (email-verification)
    // AND value=accountId (reset/delete tokens store the user id in `value`).
    const whereJson = JSON.stringify(vDel!.where);
    expect(whereJson).toContain("p@example.com");
    expect(whereJson).toContain("U1");
    // …and in the same transaction, before the user delete the cascade hangs off.
    const vIdx = ops.findIndex((o) => o.op === "delete" && o.table === "verification");
    const uIdx = ops.findIndex((o) => o.op === "delete.returning" && o.table === "user");
    expect(vIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeLessThan(uIdx);
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
