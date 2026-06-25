import { beforeEach, describe, expect, it, vi } from "vitest";

// Write-time validation for the jsonb config/settings columns. The store fns are
// the persistence boundary: a malformed value must be REJECTED before it reaches
// the column (defense-in-depth behind the action-layer parse), and a valid value
// must pass straight through to the write. There is no live test DB, so getDb()
// is a hand-rolled fake that records every write op and returns canned rows.

// What each write op was called with, in order, so we can assert "nothing was
// persisted" on a rejected write and "the validated value was written" on a good one.
const writes: { op: string; table: string; value?: unknown }[] = [];
// Canned rows the fake returns for the ownership `select` (setEnrollmentConfig /
// assignProgram check the learner is owned before writing). Default: owned.
const learnerRows = { value: [{ id: "L1", accountId: "acc-1" }] as Record<string, unknown>[] };

function tableName(t: unknown): string {
  return (t as { _name?: string })._name ?? "unknown";
}

/** Thenable chainable query builder mirroring the Drizzle surface the store uses. */
function builder(op: string, table: string, value?: unknown) {
  const chain = {
    op,
    table,
    value,
    from(t: unknown) {
      chain.table = tableName(t);
      return chain;
    },
    where() {
      return chain;
    },
    set(v: unknown) {
      chain.value = v;
      return chain;
    },
    values(v: unknown) {
      chain.value = v;
      return chain;
    },
    limit() {
      return chain;
    },
    onConflictDoUpdate() {
      return chain;
    },
    returning() {
      writes.push({ op: chain.op, table: chain.table, value: chain.value });
      // update().returning() → one affected row so the store reports success.
      return Promise.resolve([{ id: "row-1" }]);
    },
    then<T>(resolve: (rows: unknown[]) => T) {
      if (chain.op === "select") {
        const rows = chain.table === "learner" ? learnerRows.value : [];
        return Promise.resolve(rows).then(resolve);
      }
      // insert without .returning() (assignProgram) resolves once recorded.
      writes.push({ op: chain.op, table: chain.table, value: chain.value });
      return Promise.resolve([]).then(resolve);
    },
  };
  return chain;
}

const db = {
  select() {
    return builder("select", "unknown");
  },
  insert(t: unknown) {
    return builder("insert", tableName(t));
  },
  update(t: unknown) {
    return builder("update", tableName(t));
  },
};

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/db/schema", () => ({
  learner: { _name: "learner", id: {}, accountId: {}, settings: {} },
  enrollment: { _name: "enrollment", id: {}, learnerId: {}, programSlug: {}, status: {}, config: {} },
  attempt: { _name: "attempt" },
  skillState: { _name: "skill_state" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
}));

const { assignProgram, setEnrollmentConfig, saveLearnerSettings } = await import("./store");

beforeEach(() => {
  writes.length = 0;
  learnerRows.value = [{ id: "L1", accountId: "acc-1" }];
});

describe("setEnrollmentConfig (write-time validation)", () => {
  it("persists a valid config (passes through the schema unchanged)", async () => {
    const ok = await setEnrollmentConfig("acc-1", "L1", "prog", {
      band: "ready",
      aiPractice: false,
      dailyGoal: 5,
    });
    expect(ok).toBe(true);
    const write = writes.find((w) => w.op === "update" && w.table === "enrollment");
    expect(write?.value).toMatchObject({ config: { band: "ready", aiPractice: false, dailyGoal: 5 } });
  });

  it("rejects a malformed config and writes NOTHING (no enrollment update)", async () => {
    await expect(
      // aiPractice must be a boolean; the string "false" would otherwise persist
      // and silently fail-open the §8 gate on the next read.
      setEnrollmentConfig("acc-1", "L1", "prog", {
        aiPractice: "false",
      } as unknown as Parameters<typeof setEnrollmentConfig>[3]),
    ).rejects.toThrow();
    expect(writes.some((w) => w.op === "update" && w.table === "enrollment")).toBe(false);
  });

  it("rejects an out-of-range dailyGoal before persisting", async () => {
    await expect(
      setEnrollmentConfig("acc-1", "L1", "prog", { dailyGoal: 999 }),
    ).rejects.toThrow();
    expect(writes.some((w) => w.op === "update")).toBe(false);
  });

  it("does not validate (or write) when the learner is not owned", async () => {
    // Ownership fails first → false, no write — even though the config is bad,
    // the not-owned short-circuit takes precedence (no throw).
    learnerRows.value = [];
    const ok = await setEnrollmentConfig("acc-1", "L1", "prog", {
      aiPractice: "false",
    } as unknown as Parameters<typeof setEnrollmentConfig>[3]);
    expect(ok).toBe(false);
    expect(writes.some((w) => w.op === "update")).toBe(false);
  });
});

describe("saveLearnerSettings (write-time validation)", () => {
  it("persists valid settings (passes through the schema unchanged)", async () => {
    const ok = await saveLearnerSettings("acc-1", "L1", { aiPractice: false, readAloud: true });
    expect(ok).toBe(true);
    const write = writes.find((w) => w.op === "update" && w.table === "learner");
    expect(write?.value).toMatchObject({ settings: { aiPractice: false, readAloud: true } });
  });

  it("rejects malformed settings and writes NOTHING (no learner update)", async () => {
    await expect(
      saveLearnerSettings("acc-1", "L1", {
        aiPractice: "nope",
      } as unknown as Parameters<typeof saveLearnerSettings>[2]),
    ).rejects.toThrow();
    expect(writes.some((w) => w.op === "update" && w.table === "learner")).toBe(false);
  });
});

describe("assignProgram (write-time validation)", () => {
  it("writes a schema-validated empty config on a fresh enrollment", async () => {
    const ok = await assignProgram("acc-1", "L1", "prog", "pv-1");
    expect(ok).toBe(true);
    const write = writes.find((w) => w.op === "insert" && w.table === "enrollment");
    expect(write?.value).toMatchObject({ config: {} });
  });
});
