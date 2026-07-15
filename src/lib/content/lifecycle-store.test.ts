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
  inArray: (...a: unknown[]) => a,
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
    program: { _name: "program", id: {}, status: {}, publishedVersionId: {}, updatedAt: {} },
    programVersion: {
      _name: "program_version",
      id: {},
      programId: {},
      status: {},
      version: {},
      publishedAt: {},
    },
    unit: { _name: "unit", id: {}, programVersionId: {} },
    lesson: { _name: "lesson", id: {}, unitId: {} },
    activity: {
      _name: "activity",
      id: {},
      lessonId: {},
      activityKey: {},
      kind: {},
      config: {},
      skillTags: {},
    },
  },
}));

const {
  archiveProgram,
  publishVersion,
  saveVersionTree,
  cloneVersionToDraft,
  ActivityConfigValidationError,
  DuplicateKeyError,
  VersionNotDraftError,
} = await import("./store");

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
// Exact values handed to tx.insert(...).values(...), used to prove save persists
// schema-parsed configs rather than the raw admin JSON objects.
const txInsertedValues: unknown[] = [];
const txUpdateValues: { table: string; value: Record<string, unknown> }[] = [];

function tableName(value: unknown): string {
  return (value as { _name?: string } | null)?._name ?? "unknown";
}

/** A chainable fake `tx` covering update/set/where/returning, insert/values,
 *  delete, and select(...).from(...).where(...).for("update") — so both the
 *  publish and save transaction bodies run without a real DB. A chain resolves
 *  to: its `.returning()` payload if called; else the FOR UPDATE select rows if
 *  `.for()` was called; else []. */
function fakeTx() {
  function chainFor(
    kind: "update" | "insert" | "delete" | "select",
    initialTable = "unknown",
  ) {
    let usedFor = false;
    let usedReturning = false;
    let setStatus: string | undefined;
    let table = initialTable;
    const chain: Record<string, unknown> = {};
    chain.from = (value: unknown) => {
      table = tableName(value);
      return chain;
    };
    chain.where = () => chain;
    chain.set = (v?: { status?: unknown }) => {
      if (v && typeof v.status === "string") setStatus = v.status;
      if (v) txUpdateValues.push({ table, value: v as Record<string, unknown> });
      return chain;
    };
    chain.values = (values: unknown) => {
      if (kind === "insert") txInsertedValues.push(values);
      return chain;
    };
    chain.delete = () => chain;
    chain.for = () => {
      usedFor = true;
      txOps.push(`lock:${table}`);
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
          : table === "unit"
            ? findManyRows.units
            : table === "lesson"
              ? findManyRows.lessons
              : table === "activity"
                ? findManyRows.activities
                : [];
      return Promise.resolve(rows).then(resolve);
    };
    return chain;
  }
  return {
    select: () => chainFor("select"),
    update: (table: unknown) => chainFor("update", tableName(table)),
    insert: (table: unknown) => chainFor("insert", tableName(table)),
    delete: (table: unknown) => chainFor("delete", tableName(table)),
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
  txInsertedValues.length = 0;
  txUpdateValues.length = 0;
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

  it("rejects a stale draft whose stored activity is schema-valid but unplayable", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    findManyRows.units = [{ id: "u1", programVersionId: "v1" }];
    findManyRows.lessons = [{ id: "l1", unitId: "u1" }];
    findManyRows.activities = [
      {
        id: "a1",
        lessonId: "l1",
        activityKey: "clock",
        kind: "math-clock",
        config: {
          mode: "read",
          instruction: "Read the clock.",
          hour: 3,
          minute: 0,
          choices: ["4:00", "5:00"],
          answerIndex: 0,
        },
      },
    ];

    await expect(publishVersion("v1")).rejects.toBeInstanceOf(
      ActivityConfigValidationError,
    );
    expect(txOps).not.toContain("update:archived");
    expect(txOps).not.toContain("update:published");
  });

  it("canonicalizes stored draft configs before archiving the current version", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    findManyRows.units = [{ id: "u1", programVersionId: "v1" }];
    findManyRows.lessons = [{ id: "l1", unitId: "u1" }];
    findManyRows.activities = [
      {
        id: "a1",
        lessonId: "l1",
        activityKey: "journal",
        kind: "journal-prompt",
        skillTags: [],
        config: { prompt: "Draw one true thing." },
      },
    ];

    await publishVersion("v1");

    expect(
      txUpdateValues.find(
        ({ table, value }) => table === "activity" && Object.hasOwn(value, "config"),
      )?.value,
    ).toEqual({
      config: {
        prompt: "Draw one true thing.",
        drawing: true,
        mode: "draw",
        frames: [],
        wordBank: [],
        allowModes: ["type"],
      },
    });
    expect(txOps.indexOf("update:archived")).toBeGreaterThanOrEqual(0);
  });

  it("rejects program-wide duplicate stored activity keys before status changes", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    findManyRows.units = [{ id: "u1", programVersionId: "v1" }];
    findManyRows.lessons = [{ id: "l1", unitId: "u1" }];
    findManyRows.activities = [
      {
        id: "a1",
        lessonId: "l1",
        activityKey: "same-key",
        kind: "math-clock",
        skillTags: ["math.time"],
        config: { mode: "set", instruction: "Set it.", targetHour: 3, targetMinute: 0 },
      },
      {
        id: "a2",
        lessonId: "l1",
        activityKey: "same-key",
        kind: "math-clock",
        skillTags: ["math.time"],
        config: { mode: "set", instruction: "Set it.", targetHour: 4, targetMinute: 30 },
      },
    ];

    await expect(publishVersion("v1")).rejects.toBeInstanceOf(DuplicateKeyError);
    expect(txOps).not.toContain("update:archived");
    expect(txOps).not.toContain("update:published");
  });

  it("rejects a stored activity whose outer skills do not match runtime routing", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    findManyRows.units = [{ id: "u1", programVersionId: "v1" }];
    findManyRows.lessons = [{ id: "l1", unitId: "u1" }];
    findManyRows.activities = [
      {
        id: "a1",
        lessonId: "l1",
        activityKey: "clock",
        kind: "math-clock",
        skillTags: ["math.money"],
        config: { mode: "set", instruction: "Set it.", targetHour: 3, targetMinute: 0 },
      },
    ];

    await expect(publishVersion("v1")).rejects.toThrow(
      /runtime skill is missing from outer skills: math\.time/,
    );
    expect(txOps).not.toContain("update:archived");
    expect(txOps).not.toContain("update:published");
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

describe("archiveProgram lock order", () => {
  it("locks the program before deriving its published pointer or updating a version", async () => {
    txSelectForRows.value = [{ id: "p1", publishedVersionId: "v1" }];

    await archiveProgram("p1");

    const programLock = txOps.indexOf("lock:program");
    const firstArchive = txOps.indexOf("update:archived");
    expect(programLock).toBeGreaterThanOrEqual(0);
    expect(firstArchive).toBeGreaterThan(programLock);
    expect(txUpdateValues).toEqual(
      expect.arrayContaining([
        { table: "program_version", value: { status: "archived" } },
        {
          table: "program",
          value: expect.objectContaining({ status: "archived", publishedVersionId: null }),
        },
      ]),
    );
  });

  it("fails inside the locked transaction when the program does not exist", async () => {
    txSelectForRows.value = [];
    await expect(archiveProgram("missing")).rejects.toThrow("Program not found: missing");
    expect(txUpdateValues).toEqual([]);
  });
});

describe("saveVersionTree (Fix-F B2: in-tx draft re-check)", () => {
  const emptyInput = {
    metadata: { title: "T", languages: ["en-US"] },
    units: [],
  };

  function inputWithActivities(
    activities: {
      activityKey: string;
      kind: string;
      config: unknown;
      skillTags?: string[];
    }[],
  ) {
    return {
      metadata: { title: "T", languages: ["en-US"] },
      units: [
        {
          unitKey: "math",
          title: "Math",
          world: "garden",
          lessons: [
            {
              lessonKey: "lesson-1",
              title: "Lesson 1",
              activities: activities.map((activity) => ({
                ...activity,
                title: activity.activityKey,
                band: "ready",
                skillTags: activity.skillTags ?? [],
                standardTags: [],
              })),
            },
          ],
        },
      ],
    };
  }

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

  it.each([
    {
      kind: "math-clock",
      config: {
        mode: "read",
        instruction: "Read the clock",
        hour: 3,
        minute: 0,
        choices: ["4:00", "3:00"],
        answerIndex: 0,
      },
    },
    {
      kind: "math-money",
      config: {
        mode: "count",
        instruction: "Make 7 cents",
        palette: ["nickel"],
        targetCents: 7,
      },
    },
    {
      kind: "sort-categories",
      config: {
        instruction: "Sort the animals",
        bins: [
          { id: "farm", label: "Farm" },
          { id: "ocean", label: "Ocean" },
        ],
        items: [
          { label: "Cow", binId: "farm" },
          { label: "Pig", binId: "farm" },
          { label: "Hen", binId: "farm" },
        ],
      },
    },
    {
      kind: "seq-order",
      config: {
        instruction: "Put the steps in order",
        cards: [{ label: "Wash" }, { label: "wash" }, { label: "Dry" }],
      },
    },
  ])("rejects an unplayable $kind config before opening a write transaction", async ({ kind, config }) => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    const input = inputWithActivities([{ activityKey: "unplayable", kind, config }]);

    await expect(saveVersionTree("v1", input)).rejects.toBeInstanceOf(
      ActivityConfigValidationError,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(txInsertedValues).toEqual([]);
  });

  it("persists schema-parsed configs with defaults applied", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    const input = inputWithActivities([
      {
        activityKey: "clock",
        kind: "math-clock",
        skillTags: ["math.time"],
        config: {
          mode: "read",
          instruction: "Read the clock",
          hour: 3,
          minute: 0,
          choices: ["3:00", "4:00"],
          answerIndex: 0,
        },
      },
      {
        activityKey: "journal",
        kind: "journal-prompt",
        config: { prompt: "Draw and tell about your day." },
      },
    ]);

    await saveVersionTree("v1", input);

    const activityRows = txInsertedValues.find(
      (values): values is { activityKey: string; config: unknown }[] =>
        Array.isArray(values) &&
        values.length > 0 &&
        values.every(
          (value) =>
            typeof value === "object" && value !== null && "activityKey" in value && "config" in value,
        ),
    );
    expect(activityRows).toBeDefined();
    expect(activityRows?.find((row) => row.activityKey === "clock")?.config).toEqual({
      mode: "read",
      instruction: "Read the clock",
      hour: 3,
      minute: 0,
      choices: ["3:00", "4:00"],
      answerIndex: 0,
    });
    expect(activityRows?.find((row) => row.activityKey === "journal")?.config).toEqual({
      prompt: "Draw and tell about your day.",
      drawing: true,
      mode: "draw",
      frames: [],
      wordBank: [],
      allowModes: ["type"],
    });
  });

  it("rejects unknown config fields instead of silently persisting model/editor residue", async () => {
    versionFindFirst.value = { id: "v1", programId: "p1", status: "draft" };
    const input = inputWithActivities([
      {
        activityKey: "clock",
        kind: "math-clock",
        config: {
          mode: "read",
          instruction: "Read the clock",
          hour: 3,
          minute: 0,
          choices: ["3:00", "4:00"],
          answerIndex: 0,
          editorOnly: "reject me",
        },
      },
    ]);

    await expect(saveVersionTree("v1", input)).rejects.toBeInstanceOf(
      ActivityConfigValidationError,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(txInsertedValues).toEqual([]);
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
