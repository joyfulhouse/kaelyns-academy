import { describe, it, expect, vi, beforeEach } from "vitest";

// recordAttempt's atomicity is exercised against a hand-rolled fake `tx` (there
// is no live test DB; the rest of the suite is pure-function). The fake records
// every statement so we can assert: a transaction is opened, the attempt row
// and the skill fold both run inside it, the tenancy check runs first, and the
// skill write takes the lock-then-update path on an existing row.
const ops: { op: string; table: string }[] = [];
// The skill of each skill_state insert, in call order — lets a test assert the
// per-skill FOR UPDATE locks are acquired in a deterministic (sorted) order.
const lockedSkills: string[] = [];
// The values() payload of each `attempt` insert — lets a test assert provenance
// (gen_model/gen_route/gen_at) is persisted for generated rows and null otherwise.
const attemptInserts: Record<string, unknown>[] = [];
// The values() payload of each `star_ledger` insert — lets a test assert the
// star-economy earn (delta/reason/refId) written inside recordAttempt's tx.
const ledgerInserts: Record<string, unknown>[] = [];
// Mutable canned rows the fake `tx` returns for each select target.
const learnerRows = { value: [{ id: "L1" }] as Record<string, unknown>[] };
const skillRows = { value: [] as Record<string, unknown>[] };
// The in-tx active-enrollment gate read (Fix-F A4): default ACTIVE so the
// happy-path tests persist; the gate tests override to removed/paused/none.
const enrollmentRows = { value: [{ status: "active" }] as Record<string, unknown>[] };
// The in-tx "prior authored completion" read (star economy): default a single
// row (only the just-inserted attempt) so the happy path is a first completion;
// the repeat-completion test overrides to two rows (prior + just-inserted).
const attemptRows = { value: [{ id: "new" }] as Record<string, unknown>[] };

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
    where() {
      return chain;
    },
    set() {
      return chain;
    },
    values(v?: Record<string, unknown>) {
      if (chain.table === "skill_state" && v && typeof v.skill === "string") {
        lockedSkills.push(v.skill);
      }
      if (chain.op === "insert" && chain.table === "attempt" && v) {
        attemptInserts.push(v);
      }
      if (chain.op === "insert" && chain.table === "star_ledger" && v) {
        ledgerInserts.push(v);
      }
      return chain;
    },
    onConflictDoNothing() {
      ops.push({ op: "onConflictDoNothing", table: chain.table });
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
          : chain.op === "select" && chain.table === "skill_state"
            ? skillRows.value
            : chain.op === "select" && chain.table === "enrollment"
              ? enrollmentRows.value
              : chain.op === "select" && chain.table === "attempt"
                ? attemptRows.value
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
  update(t: unknown) {
    return builder("update", tableName(t));
  },
};

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx));

vi.mock("@/lib/db", () => ({ getDb: () => ({ transaction }) }));
vi.mock("@/lib/db/schema", () => ({
  learner: { _name: "learner", id: {}, accountId: {} },
  attempt: { _name: "attempt", id: {}, learnerId: {}, activityId: {}, generated: {} },
  enrollment: { _name: "enrollment", learnerId: {}, programSlug: {}, status: {} },
  skillState: { _name: "skill_state", id: {}, learnerId: {}, skill: {} },
  starLedger: { _name: "star_ledger" },
}));
// drizzle-orm operators are used only to build opaque predicate objects here.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
}));

import { EnrollmentNotActiveError, nextSkillRecord, recordAttempt } from "./store";

const input = {
  learnerId: "L1",
  programSlug: "kaelyn-adaptive",
  activityId: "act-1",
  kind: "math",
  score: {
    correct: 3,
    total: 3,
    stars: 3 as const,
    skillEvidence: [{ skill: "math.add", outcome: "solid" as const }],
  },
  day: "2026-06-15",
};

describe("recordAttempt (atomic persistence)", () => {
  beforeEach(() => {
    ops.length = 0;
    lockedSkills.length = 0;
    attemptInserts.length = 0;
    ledgerInserts.length = 0;
    transaction.mockClear();
    learnerRows.value = [{ id: "L1" }];
    skillRows.value = [];
    enrollmentRows.value = [{ status: "active" }];
    attemptRows.value = [{ id: "new" }];
  });

  it("runs inside a single transaction", async () => {
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", input);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("persists the attempt row and folds the skill inside the tx", async () => {
    // No prior skill row: materialize (onConflictDoNothing) → lock → update.
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", input);

    expect(ops).toContainEqual({ op: "insert", table: "attempt" });
    expect(ops).toContainEqual({ op: "onConflictDoNothing", table: "skill_state" });
    expect(ops).toContainEqual({ op: "select.for", table: "skill_state" });
    expect(ops).toContainEqual({ op: "update", table: "skill_state" });
    // Tenancy check (learner select) happens before the attempt insert.
    const attemptIdx = ops.findIndex((o) => o.op === "insert" && o.table === "attempt");
    const learnerIdx = ops.findIndex((o) => o.op === "select" && o.table === "learner");
    expect(learnerIdx).toBeGreaterThanOrEqual(0);
    expect(learnerIdx).toBeLessThan(attemptIdx);
  });

  it("takes the lock-then-update path on an existing skill row (upsert)", async () => {
    // Existing row with prior evidence: fold builds on it, then UPDATE the
    // located row (never a second insert of the same (learner,skill)).
    skillRows.value = [{ id: "S1", evidence: [{ day: "2026-06-13", outcome: "solid" }] }];
    await recordAttempt("acct-1", input);

    const skillOps = ops.filter((o) => o.table === "skill_state").map((o) => o.op);
    // Materialize-then-lock-then-update: a conflict-safe insert, a FOR UPDATE
    // lock, and exactly one update (never a second bare insert of the row).
    expect(skillOps).toContain("onConflictDoNothing");
    expect(skillOps).toContain("select.for");
    expect(skillOps.filter((o) => o === "update")).toHaveLength(1);
    expect(skillOps.indexOf("select.for")).toBeLessThan(skillOps.lastIndexOf("update"));
    // Prior solid + today's solid = two distinct days → folds to solid.
    const folded = nextSkillRecord(
      [{ day: "2026-06-13", outcome: "solid" }],
      "solid",
      "2026-06-15",
    );
    expect(folded.outcome).toBe("solid");
  });

  it("rejects when the learner is not owned by the account (no attempt write)", async () => {
    learnerRows.value = [];
    await expect(recordAttempt("acct-1", input)).rejects.toThrow("learner not found");
    expect(ops.some((o) => o.op === "insert" && o.table === "attempt")).toBe(false);
  });

  // ── P6 provenance: gen_model/gen_route/gen_at on generated attempts ──────────

  it("persists provenance (gen_model/gen_route/gen_at) on a generated attempt", async () => {
    skillRows.value = [{ id: "S1", evidence: [] }];
    const at = new Date("2026-06-26T12:00:00.000Z");
    await recordAttempt("acct-1", {
      ...input,
      generated: true,
      provenance: { model: "ha-assist", route: "ready", at },
    });
    expect(attemptInserts).toHaveLength(1);
    expect(attemptInserts[0]).toMatchObject({
      generated: true,
      genModel: "ha-assist",
      genRoute: "ready",
      genAt: at,
    });
  });

  it("leaves provenance columns null for an authored attempt", async () => {
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", input); // no generated flag, no provenance
    expect(attemptInserts).toHaveLength(1);
    expect(attemptInserts[0]).toMatchObject({
      generated: false,
      genModel: null,
      genRoute: null,
      genAt: null,
    });
  });

  it("drops provenance even if passed on a non-generated attempt (defense-in-depth)", async () => {
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", {
      ...input,
      generated: false,
      provenance: { model: "ha-assist", route: "ready", at: new Date() },
    });
    expect(attemptInserts[0]).toMatchObject({ genModel: null, genRoute: null, genAt: null });
  });

  // ── Fix-F A4: server-authoritative curation gate (active enrollment required) ──

  it("persists when an ACTIVE enrollment exists for the program", async () => {
    enrollmentRows.value = [{ status: "active" }];
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", input);
    // The active-enrollment read happens inside the tx, AFTER the tenancy check
    // and BEFORE the attempt insert (fail-closed before any write).
    const enrollIdx = ops.findIndex((o) => o.op === "select" && o.table === "enrollment");
    const learnerIdx = ops.findIndex((o) => o.op === "select" && o.table === "learner");
    const attemptIdx = ops.findIndex((o) => o.op === "insert" && o.table === "attempt");
    expect(learnerIdx).toBeLessThan(enrollIdx);
    expect(enrollIdx).toBeGreaterThanOrEqual(0);
    expect(enrollIdx).toBeLessThan(attemptIdx);
  });

  it("throws EnrollmentNotActiveError and writes nothing when no enrollment exists", async () => {
    enrollmentRows.value = [];
    await expect(recordAttempt("acct-1", input)).rejects.toBeInstanceOf(EnrollmentNotActiveError);
    expect(ops.some((o) => o.op === "insert" && o.table === "attempt")).toBe(false);
    expect(ops.some((o) => o.op === "update" && o.table === "skill_state")).toBe(false);
  });

  it("throws EnrollmentNotActiveError and writes nothing when the enrollment is removed", async () => {
    enrollmentRows.value = [{ status: "removed" }];
    await expect(recordAttempt("acct-1", input)).rejects.toBeInstanceOf(EnrollmentNotActiveError);
    expect(ops.some((o) => o.op === "insert" && o.table === "attempt")).toBe(false);
  });

  it("throws EnrollmentNotActiveError and writes nothing when the enrollment is paused", async () => {
    enrollmentRows.value = [{ status: "paused" }];
    await expect(recordAttempt("acct-1", input)).rejects.toBeInstanceOf(EnrollmentNotActiveError);
    expect(ops.some((o) => o.op === "insert" && o.table === "attempt")).toBe(false);
  });

  it("acquires the per-skill row locks in a deterministic sorted order", async () => {
    // Evidence supplied out of order: the fold must lock skills sorted, so two
    // concurrent attempts for the same learner with overlapping skills can't lock
    // the same rows in opposite orders and deadlock (which would drop a submit).
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", {
      ...input,
      score: {
        ...input.score,
        skillEvidence: [
          { skill: "math.sub", outcome: "solid" as const },
          { skill: "math.add", outcome: "solid" as const },
          { skill: "math.count", outcome: "solid" as const },
        ],
      },
    });
    expect(lockedSkills).toEqual(["math.add", "math.count", "math.sub"]);
  });

  // ── Adventure 2.0: star-economy earn on first authored completion ───────────

  it("credits the ledger inside the tx on a first authored completion", async () => {
    // Default attemptRows.value is a single row (only the just-inserted attempt).
    await recordAttempt("acct-1", input);
    expect(ledgerInserts).toEqual([
      expect.objectContaining({ delta: 3, reason: "activity_complete", refId: input.activityId }),
    ]);
  });

  it("writes no ledger row for generated practice", async () => {
    await recordAttempt("acct-1", { ...input, generated: true });
    expect(ledgerInserts).toHaveLength(0);
  });

  it("writes no ledger row on a repeat completion", async () => {
    attemptRows.value = [{ id: "prev" }, { id: "new" }]; // prior authored attempt exists
    await recordAttempt("acct-1", input);
    expect(ledgerInserts).toHaveLength(0);
  });
});

describe("nextSkillRecord (DB evidence fold)", () => {
  it("first solid attempt is emerging, not yet solid", () => {
    const r = nextSkillRecord(undefined, "solid", "2026-06-13");
    expect(r.outcome).toBe("emerging");
    expect(r.history).toEqual([{ day: "2026-06-13", outcome: "solid" }]);
  });

  it("locks to solid on the second distinct solid day", () => {
    const r1 = nextSkillRecord(undefined, "solid", "2026-06-13");
    const r2 = nextSkillRecord(r1.history, "solid", "2026-06-14");
    expect(r2.outcome).toBe("solid");
  });

  it("two solids on the SAME day stay emerging", () => {
    const r1 = nextSkillRecord(undefined, "solid", "2026-06-13");
    const r2 = nextSkillRecord(r1.history, "solid", "2026-06-13");
    expect(r2.outcome).toBe("emerging");
  });

  it("an attempt with a not_yet outcome still counts as emerging (started)", () => {
    expect(nextSkillRecord(undefined, "not_yet", "2026-06-13").outcome).toBe("emerging");
  });

  it("caps history length", () => {
    let history: { day: string; outcome: "solid" }[] = [];
    for (let i = 0; i < 40; i++) {
      const r = nextSkillRecord(history, "solid", `d${i}`);
      history = r.history as { day: string; outcome: "solid" }[];
    }
    expect(history.length).toBeLessThanOrEqual(24);
  });
});
