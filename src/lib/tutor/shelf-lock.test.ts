import { describe, it, expect, vi, beforeEach } from "vitest";

// withLessonGenerationLock claims a lesson's LLM spend BEFORE the model call by
// serializing recount → generate → insert behind a per-(learner, program, unit,
// lesson) advisory
// lock (final review Fix 2). There is no live test DB, so this drives it against a
// hand-rolled fake `tx` that records an op-log — mirroring store.test.ts's ordering
// assertions — to prove the SEQUENCE (lock first, recount INSIDE the lock, generate
// only after) and that a race loser sees the winner's rows and returns them WITHOUT
// a model call (so N concurrent completions burn one LLM batch, not N).

// The ordered statements the fake tx runs, so a test can assert lock-before-recount
// and that `generate` (the spend) is invoked strictly after the in-lock recount.
const ops: string[] = [];
// Canned rows per select/insert target, mutable per test.
const ownedRows = { value: [{ id: "L1" }] as Record<string, unknown>[] };
const existingRows = { value: [] as Record<string, unknown>[] };
const insertedRows = { value: [] as Record<string, unknown>[] };
const lockKeys: string[] = [];
const generatedWhere = { value: [] as unknown[] };

function tableName(t: unknown): string {
  return (t as { _name?: string })._name ?? "unknown";
}

/** A thenable query builder: chainable methods return `this`; awaiting records the
 *  resolved (op:table) into `ops` and yields that target's canned rows. */
function builder(op: string, table = "unknown") {
  const chain = {
    from(t: unknown) {
      table = tableName(t);
      return chain;
    },
    where(predicate: unknown) {
      if (table === "generated_activity") generatedWhere.value = predicate as unknown[];
      return chain;
    },
    limit() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    values() {
      return chain;
    },
    returning() {
      ops.push(`insert:${table}`);
      return Promise.resolve(insertedRows.value);
    },
    then<T>(resolve: (rows: unknown[]) => T) {
      ops.push(`${op}:${table}`);
      const rows =
        table === "learner"
          ? ownedRows.value
          : table === "generated_activity"
            ? existingRows.value
            : [];
      return Promise.resolve(rows).then(resolve);
    },
  };
  return chain;
}

const tx = {
  // The advisory-lock statement (pg_advisory_xact_lock): recorded as the first op.
  execute(query: unknown) {
    ops.push("lock");
    const values = (query as { values?: unknown[] }).values ?? [];
    lockKeys.push(String(values[0]));
    return Promise.resolve();
  },
  select() {
    return builder("select");
  },
  insert(t: unknown) {
    return builder("insert", tableName(t));
  },
};

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
const db = { transaction };

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/db/schema", () => ({
  learner: { _name: "learner", id: {}, accountId: {} },
  generatedActivity: {
    _name: "generated_activity",
    id: {},
    learnerId: "generated_activity.learner_id",
    programSlug: "generated_activity.program_slug",
    unitKey: "generated_activity.unit_key",
    lessonId: "generated_activity.lesson_id",
    createdAt: {},
  },
}));
// drizzle-orm helpers build opaque predicate objects here; `sql` is the tagged
// template the advisory-lock statement uses. Only the operators withLessonGeneration-
// Lock references need real behavior; the rest are stubs for store.ts's load-time
// named imports.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (column: unknown, value: unknown) => ({ column, value }),
  asc: (a: unknown) => a,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  count: () => ({}),
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
  lt: (...a: unknown[]) => a,
  or: (...a: unknown[]) => a,
  sum: (a: unknown) => a,
}));

import { withLessonGenerationLock, type NewGeneratedActivity } from "./store";
import { SHELF_BATCH, SHELF_LESSON_CAP } from "./shelf";

/** A generated_activity row the fake tx echoes from insert().returning() / the
 *  recount select — carries the Date `createdAt` toShelfItem projects. */
function genRow(id: string): Record<string, unknown> {
  return {
    id,
    lessonId: "u1-l1",
    unitKey: "u1",
    kind: "sightword-game",
    title: `Fresh: ${id}`,
    skillTags: [],
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  };
}

describe("withLessonGenerationLock (spend claimed under an advisory lock)", () => {
  beforeEach(() => {
    ops.length = 0;
    transaction.mockClear();
    ownedRows.value = [{ id: "L1" }];
    existingRows.value = [];
    insertedRows.value = [];
    lockKeys.length = 0;
    generatedWhere.value = [];
  });

  it("takes the lock, recounts INSIDE it, THEN generates + inserts (empty shelf → the winner)", async () => {
    insertedRows.value = [genRow("g1")];
    const built: NewGeneratedActivity = {
      programSlug: "p",
      unitKey: "u1",
      lessonId: "u1-l1",
      kind: "sightword-game",
      title: "Fresh: g1",
      config: {},
      skillTags: [],
      genModel: "m",
      genRoute: "shelf",
      genAt: new Date(),
    };
    // The `generate` callback logs itself so the op-log proves the spend runs only
    // after the lock + recount — never before.
    const generate = vi.fn(async (room: number) => {
      ops.push(`generate(${room})`);
      return [built];
    });

    const items = await withLessonGenerationLock(
      "acc-1",
      "L1",
      { programSlug: "p", unitKey: "u1", lessonId: "u1-l1" },
      false,
      generate,
    );

    expect(ops).toEqual([
      "lock",
      "select:learner",
      "select:generated_activity",
      `generate(${Math.min(SHELF_BATCH, SHELF_LESSON_CAP)})`,
      "insert:generated_activity",
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(lockKeys).toEqual(["L1:p:u1:u1-l1"]);
    expect(generatedWhere.value).toEqual([
      { column: "generated_activity.learner_id", value: "L1" },
      { column: "generated_activity.program_slug", value: "p" },
      { column: "generated_activity.unit_key", value: "u1" },
      { column: "generated_activity.lesson_id", value: "u1-l1" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("g1");
  });

  it("a race loser sees the winner's rows under the lock and returns them WITHOUT a model call (no spend)", async () => {
    // The winner already committed a row; the loser's in-lock recount observes it,
    // so `generate` (the LLM batch) is never called and nothing new is inserted.
    existingRows.value = [genRow("g1")];
    const generate = vi.fn(async () => {
      ops.push("generate");
      return [];
    });

    const items = await withLessonGenerationLock(
      "acc-1",
      "L1",
      { programSlug: "p", unitKey: "u1", lessonId: "u1-l1" },
      false,
      generate,
    );

    expect(generate).not.toHaveBeenCalled();
    expect(ops).toEqual(["lock", "select:learner", "select:generated_activity"]);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("g1");
  });

  it("rejects a foreign account under the lock, before any generation (tenancy)", async () => {
    ownedRows.value = [];
    const generate = vi.fn();

    await expect(
      withLessonGenerationLock(
        "acc-2",
        "L1",
        { programSlug: "p", unitKey: "u1", lessonId: "u1-l1" },
        false,
        generate,
      ),
    ).rejects.toThrow("learner not found");
    expect(generate).not.toHaveBeenCalled();
    // The lock is still taken first (serialization holds even for a doomed call).
    expect(ops).toEqual(["lock", "select:learner"]);
  });
});
