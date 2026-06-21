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
}));

// Canned rows the fake relational layer returns.
const programRow = { value: null as Record<string, unknown> | null };
const versionFindFirst = { value: null as Record<string, unknown> | null };

const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    query: {
      program: { findFirst: () => Promise.resolve(programRow.value) },
      // Both the publish lookup (by id) and the clone existing-draft lookup
      // (by programId+status) route through this single canned value.
      programVersion: { findFirst: () => Promise.resolve(versionFindFirst.value) },
    },
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

/** A minimal chainable fake `tx`: update/set/where return `this` and the chain
 *  is awaitable, so the publish transaction body runs without a real DB. */
function fakeTx() {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "set", "where"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([]).then(resolve);
  return chain;
}

beforeEach(() => {
  programRow.value = null;
  versionFindFirst.value = null;
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
});
