import { describe, it, expect, vi, beforeEach } from "vitest";

// recordAttempt's atomicity is exercised against a hand-rolled fake `tx` (there
// is no live test DB; the rest of the suite is pure-function). The fake records
// every statement so we can assert: a transaction is opened, the attempt row
// and the skill fold both run inside it, the tenancy check runs first, and the
// skill write takes the lock-then-update path on an existing row.
const ops: { op: string; table: string }[] = [];
// Mutable canned rows the fake `tx` returns for each select target.
const learnerRows = { value: [{ id: "L1" }] as Record<string, unknown>[] };
const skillRows = { value: [] as Record<string, unknown>[] };

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
    values() {
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
  attempt: { _name: "attempt" },
  enrollment: { _name: "enrollment" },
  skillState: { _name: "skill_state", id: {}, learnerId: {}, skill: {} },
}));
// drizzle-orm operators are used only to build opaque predicate objects here.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
}));

import { nextSkillRecord, recordAttempt } from "./store";

const input = {
  learnerId: "L1",
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
    transaction.mockClear();
    learnerRows.value = [{ id: "L1" }];
    skillRows.value = [];
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
