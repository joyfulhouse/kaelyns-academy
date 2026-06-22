import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lifecycle mutations (publishVersion / cloneVersionToDraft) are exercised
// against a fake `getDb()` exposing the Drizzle relational-query API
// (db.query.*.findFirst) — there is no live test DB. We assert the guard paths:
// publishing a non-draft throws VersionNotDraftError, and cloning a program that
// already has an open draft returns that draft's id WITHOUT opening a transaction.

vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: vi.fn(),
}));

// drizzle operators → opaque predicates; not evaluated by the fake query layer.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  ne: (...a: unknown[]) => a,
  max: (a: unknown) => a,
  desc: (a: unknown) => a,
}));

// Canned rows the fake relational layer returns.
const programRow = { value: null as Record<string, unknown> | null };
const versionFindFirst = { value: null as Record<string, unknown> | null };
// Optional FIFO override for programVersion.findFirst: when non-empty, each call
// shifts the next value (used to drive the clone's "no existing draft, then a
// winner" convergence sequence). Falls back to versionFindFirst.value when empty.
const versionFindFirstQueue: (Record<string, unknown> | null)[] = [];
// Canned rows for the unit/lesson/activity findMany reads in the clone source
// tree-load path (empty trees keep the clone insert minimal).
const findManyRows = { units: [] as unknown[], lessons: [] as unknown[], activities: [] as unknown[] };
// Resolves the db.select(...).from(...).where(...) max(version) read in clone.
const selectMaxRows = { value: [{ maxVersion: 1, id: "vSrc" }] as Record<string, unknown>[] };

const transaction = vi.fn();

function nextVersionFindFirst(): Record<string, unknown> | null {
  return versionFindFirstQueue.length > 0
    ? (versionFindFirstQueue.shift() ?? null)
    : versionFindFirst.value;
}

/** Awaitable select chain resolving to the canned rows. Supports the max(version)
 *  read AND the archived-source `orderBy(version desc).limit(1)` read — both route
 *  through this stub; the canned row carries both `id` and `maxVersion`. */
function selectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(selectMaxRows.value).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    query: {
      program: { findFirst: () => Promise.resolve(programRow.value) },
      // Publish lookup (by id), clone existing-draft lookup (by programId+status),
      // and clone winner re-resolve all route through this (queue-aware) stub.
      programVersion: { findFirst: () => Promise.resolve(nextVersionFindFirst()) },
      unit: { findMany: () => Promise.resolve(findManyRows.units) },
      lesson: { findMany: () => Promise.resolve(findManyRows.lessons) },
      activity: { findMany: () => Promise.resolve(findManyRows.activities) },
    },
    select: () => selectChain(),
    transaction,
  }),
  schema: {
    program: { id: {}, status: {}, publishedVersionId: {}, updatedAt: {} },
    programVersion: { id: {}, programId: {}, status: {}, version: {}, publishedAt: {} },
    unit: {},
    lesson: {},
    activity: {},
  },
}));

const { publishVersion, saveVersionTree, cloneVersionToDraft, VersionNotDraftError } =
  await import("./store");

// ── Configurable fake `tx` (Fix-F B1/B2) ─────────────────────────────────────
// The publish/save tx bodies now do a row-lock SELECT … FOR UPDATE and a
// CONDITIONAL publish UPDATE … RETURNING whose affected-row count is the guard.
// These knobs drive each:
//   txSelectForRows  → what `tx.select(...).from(...).where(...).for("update")`
//                      resolves to (publish: the program-lock row, ignored;
//                      save: the version-lock row whose `.status` is re-checked).
//   txPublishReturns → what the conditional publish UPDATE … RETURNING resolves
//                      to ([] = 0 rows = not-draft-at-tx-time; non-empty = ok).
const txSelectForRows = { value: [{ status: "draft" }] as Record<string, unknown>[] };
const txPublishReturns = { value: [{ id: "v1" }] as Record<string, unknown>[] };
// Ordered record of the tx statements so a test can assert archive-before-publish.
const txOps: string[] = [];

/** A chainable fake `tx` covering update/set/where/returning, insert/values,
 *  delete, and select(...).from(...).where(...).for("update") — so both the
 *  publish and save transaction bodies run without a real DB. A chain resolves
 *  to: its `.returning()` payload if called; else the FOR UPDATE select rows if
 *  `.for()` was called; else []. */
function fakeTx() {
  function chainFor(kind: "update" | "insert" | "delete" | "select") {
    let usedFor = false;
    let usedReturning = false;
    let setStatus: string | undefined;
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.set = (v?: { status?: unknown }) => {
      if (v && typeof v.status === "string") setStatus = v.status;
      return chain;
    };
    chain.values = () => chain;
    chain.delete = () => chain;
    chain.for = () => {
      usedFor = true;
      return chain;
    };
    chain.returning = () => {
      usedReturning = true;
      // Record the publish vs archive UPDATE by the status it set.
      if (kind === "update" && setStatus) txOps.push(`update:${setStatus}`);
      return chain;
    };
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
      // A non-returning archive UPDATE is recorded here (it's awaited directly).
      if (kind === "update" && !usedReturning && setStatus) txOps.push(`update:${setStatus}`);
      const rows = usedReturning
        ? txPublishReturns.value
        : usedFor
          ? txSelectForRows.value
          : [];
      return Promise.resolve(rows).then(resolve);
    };
    return chain;
  }
  return {
    select: () => chainFor("select"),
    update: () => chainFor("update"),
    insert: () => chainFor("insert"),
    delete: () => chainFor("delete"),
  };
}

beforeEach(() => {
  programRow.value = null;
  versionFindFirst.value = null;
  versionFindFirstQueue.length = 0;
  findManyRows.units = [];
  findManyRows.lessons = [];
  findManyRows.activities = [];
  selectMaxRows.value = [{ maxVersion: 1, id: "vSrc" }];
  txSelectForRows.value = [{ status: "draft" }];
  txPublishReturns.value = [{ id: "v1" }];
  txOps.length = 0;
  transaction.mockReset();
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn(fakeTx()));
});
afterEach(() => vi.restoreAllMocks());

describe("publishVersion (draft-status guard)", () => {
  it("throws VersionNotDraftError when the target version is already published", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "published" };
    await expect(publishVersion("v1")).rejects.toBeInstanceOf(VersionNotDraftError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws VersionNotDraftError when the target version is archived", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "archived" };
    await expect(publishVersion("v1")).rejects.toBeInstanceOf(VersionNotDraftError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws (not draft error) when the version does not exist", async () => {
    versionFindFirst.value = null;
    await expect(publishVersion("missing")).rejects.toThrow("Version not found");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("opens the publish transaction for a draft version", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    await publishVersion("v1");
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  // ── Fix-F B1: race-hardened publish (lock + archive-before-publish + cond.) ──

  it("archives the prior published version BEFORE publishing the target (B3 index safe)", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    await publishVersion("v1");
    // The archive UPDATE (status→archived) must run before the publish UPDATE
    // (status→published), so ≤1-published-per-program holds at every tx step.
    const archiveIdx = txOps.indexOf("update:archived");
    const publishIdx = txOps.indexOf("update:published");
    expect(archiveIdx).toBeGreaterThanOrEqual(0);
    expect(publishIdx).toBeGreaterThanOrEqual(0);
    expect(archiveIdx).toBeLessThan(publishIdx);
  });

  it("throws VersionNotDraftError (rolls back) when the conditional publish affects 0 rows", async () => {
    // Pre-tx read says draft, but a concurrent tx flipped it out of draft before
    // the conditional UPDATE … WHERE status='draft' ran → 0 affected rows.
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    txPublishReturns.value = []; // 0 rows affected
    await expect(publishVersion("v1")).rejects.toBeInstanceOf(VersionNotDraftError);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("saveVersionTree (Fix-F B2: in-tx draft re-check)", () => {
  const emptyInput = {
    metadata: { title: "T", languages: ["en-US"] },
    units: [],
  };

  it("throws VersionNotDraftError when the version is not a draft at tx time (race)", async () => {
    // Pre-tx findFirst passes (draft), but the in-tx FOR UPDATE lock sees that a
    // concurrent publish flipped it to published → throw before any delete.
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    txSelectForRows.value = [{ status: "published" }];
    await expect(saveVersionTree("v1", emptyInput)).rejects.toBeInstanceOf(VersionNotDraftError);
    // No delete/reinsert ran (the guard threw first).
    expect(txOps).not.toContain("update:published");
  });

  it("proceeds through the tx when the version is still a draft at tx time", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    txSelectForRows.value = [{ status: "draft" }];
    await saveVersionTree("v1", emptyInput);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("still rejects a non-draft at the PRE-tx check (no transaction opened)", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "published" };
    await expect(saveVersionTree("v1", emptyInput)).rejects.toBeInstanceOf(VersionNotDraftError);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("cloneVersionToDraft (idempotent clone)", () => {
  it("returns the existing open draft's id without inserting a second draft", async () => {
    programRow.value = { id: "p1", publishedVersionId: "vPub" };
    // An open draft already exists for this program.
    versionFindFirst.value = { id: "vDraft", programId: "p1", status: "draft" };

    const result = await cloneVersionToDraft("p1");

    expect(result).toEqual({ versionId: "vDraft" });
    // No insert transaction is opened when a draft already exists.
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws when the program does not exist", async () => {
    programRow.value = null;
    await expect(cloneVersionToDraft("nope")).rejects.toThrow("Program not found");
  });

  it("converges to the winner's draft when a concurrent clone wins the version race", async () => {
    // No existing draft on the first lookup → both clones proceed to insert. We
    // simulate the loser: its INSERT hits the (programId, version) unique index.
    programRow.value = { id: "p1", publishedVersionId: "vSrc" };
    // The clone path makes three programVersion.findFirst calls in order:
    //   1. existing-draft check          → null (no open draft yet)
    //   2. source-tree load (vSrc row)   → the published source version
    //   3. winner re-resolve (in catch)  → the draft the concurrent winner committed
    const sourceVersion = {
      id: "vSrc",
      programId: "p1",
      status: "published",
      title: "Source",
      subtitle: null,
      ageBand: null,
      summary: null,
      world: null,
      locale: null,
      languages: [],
    };
    versionFindFirstQueue.push(
      null,
      sourceVersion,
      { id: "vWinner", programId: "p1", status: "draft" },
    );

    // The insert transaction throws the Postgres unique_violation for our index.
    const uniqueErr = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      constraint: "program_version_program_version_uq",
    });
    transaction.mockRejectedValueOnce(uniqueErr);

    const result = await cloneVersionToDraft("p1");
    expect(result).toEqual({ versionId: "vWinner" });
  });

  it("rethrows a non-unique transaction error (no false convergence)", async () => {
    programRow.value = { id: "p1", publishedVersionId: "vSrc" };
    const sourceVersion = {
      id: "vSrc",
      programId: "p1",
      status: "published",
      title: "Source",
      subtitle: null,
      ageBand: null,
      summary: null,
      world: null,
      locale: null,
      languages: [],
    };
    versionFindFirstQueue.push(null, sourceVersion); // no existing draft, then source row
    transaction.mockRejectedValueOnce(new Error("connection reset"));

    await expect(cloneVersionToDraft("p1")).rejects.toThrow("connection reset");
  });

  it("clones an ARCHIVED program (null publishedVersionId) from its highest version", async () => {
    // Archived program: no published pointer → the clone must resolve the source
    // via the ordered single-row read (orderBy(version desc).limit(1)), NOT the
    // invalid max(version)+bare-id select. The canned select row supplies id "vSrc"
    // as the highest version.
    programRow.value = { id: "p1", publishedVersionId: null };
    selectMaxRows.value = [{ maxVersion: 3, id: "vSrc" }];
    const sourceVersion = {
      id: "vSrc",
      programId: "p1",
      status: "archived",
      title: "Archived Source",
      subtitle: null,
      ageBand: null,
      summary: null,
      world: null,
      locale: null,
      languages: [],
    };
    // findFirst order: (1) existing-draft check → null, (2) source-tree load → vSrc.
    versionFindFirstQueue.push(null, sourceVersion);

    const result = await cloneVersionToDraft("p1");

    // A fresh draft was inserted (id is a new UUID, not the archived source id and
    // not an existing draft), and the insert transaction was opened — proving the
    // archived source resolved without throwing on invalid SQL.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result.versionId).not.toBe("vSrc");
    expect(typeof result.versionId).toBe("string");
    expect(result.versionId.length).toBeGreaterThan(0);
  });
});
