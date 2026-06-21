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

const { publishVersion, cloneVersionToDraft, VersionNotDraftError } = await import("./store");

/** A minimal chainable fake `tx`: update/set/where AND insert/values return
 *  `this` and the chain is awaitable, so both the publish and the clone-insert
 *  transaction bodies run without a real DB. */
function fakeTx() {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "set", "where", "insert", "values"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([]).then(resolve);
  return chain;
}

beforeEach(() => {
  programRow.value = null;
  versionFindFirst.value = null;
  versionFindFirstQueue.length = 0;
  findManyRows.units = [];
  findManyRows.lessons = [];
  findManyRows.activities = [];
  selectMaxRows.value = [{ maxVersion: 1, id: "vSrc" }];
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
