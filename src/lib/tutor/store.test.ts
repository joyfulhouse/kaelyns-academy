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
// The set() payload of each `learner_quest` update — lets a test assert the
// Adventure 2.0 attempt fold (progress/status) written inside recordAttempt's tx.
const questUpdates: Record<string, unknown>[] = [];
// The set() payload of each `checkpoint_result` update — lets a test assert the
// C1 checkpoint capture (scores merge) written inside recordAttempt's tx, AND
// the applyPlacement status flip (status: "applied", appliedAt).
const checkpointUpdates: Record<string, unknown>[] = [];
// The set() payload of each `skill_state` update — lets a test assert
// applyPlacement's baseline seed write (evidence/outcome).
const skillStateUpdates: Record<string, unknown>[] = [];
// The values() payload of each review_schedule upsert. The scheduler writes the
// full next state through insert(...).onConflictDoUpdate(...), so this captures
// both first schedules and later review folds.
const reviewScheduleInserts: Record<string, unknown>[] = [];
// Privacy-safe oral-reading witnesses are inserted and then deleted on claim.
const oralVerificationInserts: Record<string, unknown>[] = [];
const oralVerificationUpdates: Record<string, unknown>[] = [];
// Mutable canned rows the fake `tx` returns for each select target.
const learnerRows = { value: [{ id: "L1" }] as Record<string, unknown>[] };
const skillRows = { value: [] as Record<string, unknown>[] };
const reviewScheduleRows = { value: [] as Record<string, unknown>[] };
// The in-tx active-enrollment gate read (Fix-F A4): default ACTIVE so the
// happy-path tests persist; the gate tests override to removed/paused/none.
const enrollmentRows = {
  value: [
    {
      id: "E1",
      status: "active",
      programSlug: "kaelyn-adaptive",
      programVersionId: "PV1",
      config: {},
    },
  ] as Record<string, unknown>[],
};
// The in-tx checkpoint_result upsert read (C1): default a single pending row so
// a checkpointPhase attempt's fold has a row to update; unused by non-checkpoint
// tests (upsertCheckpointScore is only ever called when checkpointPhase is set).
const checkpointResultRows = {
  value: [{ id: "CR1", scores: {} }] as Record<string, unknown>[],
};
// The in-tx "prior authored completion" read (star economy): default a single
// row (only the just-inserted attempt) so the happy path is a first completion;
// the repeat-completion test overrides to two rows (prior + just-inserted).
const attemptRows = { value: [{ id: "new" }] as Record<string, unknown>[] };
// INSERT ... ON CONFLICT ... RETURNING rows. Empty simulates a duplicate
// completion id whose original attempt must be replayed without any folds.
const attemptInsertResultRows = { value: [{ id: "new" }] as Record<string, unknown>[] };
const attemptReplayRows = { value: [] as Record<string, unknown>[] };
const generatedCompletionRows = { value: [] as Record<string, unknown>[] };
const completedTodayRows = { value: [] as Record<string, unknown>[] };
const generatedActivityRows = { value: [] as Record<string, unknown>[] };
const oralVerificationRows = { value: [] as Record<string, unknown>[] };
const oralVerificationInsertResultRows = {
  value: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] as Record<string, unknown>[],
};
// The day's learner_quest rows (Adventure 2.0 fold); applyAttemptToQuests only
// SELECTs status="active" rows (mirroring the real query's WHERE clause) — the
// fake filters here so "offered leaves untouched" is actually observable.
const questRows = { value: [] as Record<string, unknown>[] };

function tableName(t: unknown): string {
  return (t as { _name?: string })._name ?? "unknown";
}

/** A thenable query builder: chainable methods return `this`; awaiting it
 *  records the (op, table) and resolves to the canned rows for that target. */
type Predicate =
  | { op: "eq" | "lte"; column: string | undefined; value: unknown }
  | { op: "and"; conditions: Predicate[] };
type Ordering = { direction: "asc" | "desc"; column: string | undefined };

function matches(row: Record<string, unknown>, predicate: Predicate | undefined): boolean {
  if (!predicate) return true;
  if (predicate.op === "and") return predicate.conditions.every((part) => matches(row, part));
  if (!predicate.column) return true;
  if (predicate.op === "eq") return row[predicate.column] === predicate.value;
  return String(row[predicate.column]) <= String(predicate.value);
}

function applyQueryShape(
  rows: Record<string, unknown>[],
  predicate: Predicate | undefined,
  ordering: Ordering | undefined,
  limit: number | undefined,
): Record<string, unknown>[] {
  const selected = rows.filter((row) => matches(row, predicate));
  if (ordering?.column) {
    selected.sort((left, right) => {
      const leftValue = left[ordering.column!];
      const rightValue = right[ordering.column!];
      const comparison =
        leftValue instanceof Date && rightValue instanceof Date
          ? leftValue.getTime() - rightValue.getTime()
          : String(leftValue).localeCompare(String(rightValue));
      return ordering.direction === "asc" ? comparison : -comparison;
    });
  }
  return limit === undefined ? selected : selected.slice(0, limit);
}

function builder(op: string, table: string, projection?: Record<string, unknown>) {
  const chain = {
    op,
    table,
    predicate: undefined as Predicate | undefined,
    ordering: undefined as Ordering | undefined,
    limitValue: undefined as number | undefined,
    from(t: unknown) {
      chain.table = tableName(t);
      return chain;
    },
    where(predicate?: Predicate) {
      chain.predicate = predicate;
      return chain;
    },
    set(v?: Record<string, unknown>) {
      if (chain.op === "update" && chain.table === "learner_quest" && v) {
        questUpdates.push(v);
      }
      if (chain.op === "update" && chain.table === "checkpoint_result" && v) {
        checkpointUpdates.push(v);
      }
      if (chain.op === "update" && chain.table === "skill_state" && v) {
        skillStateUpdates.push(v);
      }
      if (chain.op === "update" && chain.table === "oral_reading_verification" && v) {
        oralVerificationUpdates.push(v);
      }
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
      if (chain.op === "insert" && chain.table === "review_schedule" && v) {
        reviewScheduleInserts.push(v);
      }
      if (chain.op === "insert" && chain.table === "oral_reading_verification" && v) {
        oralVerificationInserts.push(v);
      }
      return chain;
    },
    onConflictDoNothing() {
      ops.push({ op: "onConflictDoNothing", table: chain.table });
      return chain;
    },
    onConflictDoUpdate() {
      ops.push({ op: "onConflictDoUpdate", table: chain.table });
      return chain;
    },
    returning() {
      return chain;
    },
    limit(value?: number) {
      chain.limitValue = value;
      return chain;
    },
    orderBy(ordering?: Ordering) {
      chain.ordering = ordering;
      return chain;
    },
    for() {
      ops.push({ op: "select.for", table: chain.table });
      return chain;
    },
    then<T>(resolve: (rows: unknown[]) => T) {
      ops.push({ op: chain.op, table: chain.table });
      const rows =
        chain.op === "insert" && chain.table === "attempt"
          ? attemptInsertResultRows.value
          : chain.op === "insert" && chain.table === "oral_reading_verification"
            ? oralVerificationInsertResultRows.value
          : chain.op === "select" && chain.table === "learner"
          ? applyQueryShape(
              learnerRows.value.map((row) => ({ accountId: "acct-1", ...row })),
              chain.predicate,
              chain.ordering,
              chain.limitValue,
            )
          : chain.op === "select" && chain.table === "skill_state"
            ? skillRows.value
            : chain.op === "select" && chain.table === "review_schedule"
              ? reviewScheduleRows.value.filter((row) => matches(row, chain.predicate))
            : chain.op === "select" && chain.table === "enrollment"
              ? applyQueryShape(
                  enrollmentRows.value.map((row) => ({
                    learnerId: "L1",
                    programSlug: "kaelyn-adaptive",
                    programVersionId: "PV1",
                    ...row,
                  })),
                  chain.predicate,
                  chain.ordering,
                  chain.limitValue,
                )
            : chain.op === "select" && chain.table === "attempt"
                ? projection && "kind" in projection
                  ? attemptReplayRows.value.map((row) => ({
                      programSlug: "kaelyn-adaptive",
                      unitKey: "unit-1",
                      programVersionId: "PV1",
                      ...row,
                    }))
                  : projection && "score" in projection
                    ? completedTodayRows.value.filter((row) =>
                        matches(row, chain.predicate),
                      )
                  : projection && Object.keys(projection).length === 1 && "completionId" in projection
                    ? generatedCompletionRows.value.filter((row) =>
                        matches(row, chain.predicate),
                      )
                  : projection && "activityId" in projection
                  ? completedTodayRows.value.filter((row) => matches(row, chain.predicate))
                  : projection && "response" in projection
                    ? applyQueryShape(
                        attemptRows.value,
                        chain.predicate,
                        chain.ordering,
                        chain.limitValue,
                      )
                    : attemptRows.value
                : chain.op === "select" && chain.table === "checkpoint_result"
                  ? checkpointResultRows.value
                  : chain.op === "select" && chain.table === "generated_activity"
                    ? applyQueryShape(
                        generatedActivityRows.value,
                        chain.predicate,
                        chain.ordering,
                        chain.limitValue,
                      )
                  : chain.op === "select" && chain.table === "oral_reading_verification"
                    ? applyQueryShape(
                        oralVerificationRows.value,
                        chain.predicate,
                        chain.ordering,
                        chain.limitValue,
                      )
                  : chain.op === "select" && chain.table === "learner_quest"
                    ? // Mirrors applyAttemptToQuests's WHERE: status="active" AND
                      // programSlug=<the recorded attempt's program> (Finding 1: cross-
                      // program leakage). A canned row with no programSlug is treated as
                      // belonging to the current program (existing tests don't care about
                      // this dimension); a row with an explicit, different programSlug is
                      // filtered out, same as the status filter already does for "offered".
                      questRows.value.filter(
                        (r) =>
                          r.status === "active" &&
                          (r.programSlug === undefined || r.programSlug === input.programSlug),
                      )
                    : [];
      return Promise.resolve(rows).then(resolve);
    },
  };
  return chain;
}

/** The four verbs a fake connection exposes — shared by the tx object AND the
 *  top-level `db` (getPendingCheckpointResults/redoCheckpoint/getLearner run
 *  OUTSIDE a transaction, so getDb() itself must answer select/delete too). */
function connection() {
  return {
    select(projection?: Record<string, unknown>) {
      return builder("select", "unknown", projection);
    },
    insert(t: unknown) {
      return builder("insert", tableName(t));
    },
    update(t: unknown) {
      return builder("update", tableName(t));
    },
    delete(t: unknown) {
      return builder("delete", tableName(t));
    },
  };
}

const tx = connection();

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx));

const db = { ...connection(), transaction };

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/db/schema", () => ({
  learner: {
    _name: "learner",
    id: { name: "id" },
    accountId: { name: "accountId" },
    settings: { name: "settings" },
  },
  attempt: {
    _name: "attempt",
    id: { name: "id" },
    learnerId: { name: "learnerId" },
    activityId: { name: "activityId" },
    kind: { name: "kind" },
    generated: { name: "generated" },
    programSlug: { name: "programSlug" },
    unitKey: { name: "unitKey" },
    programVersionId: { name: "programVersionId" },
    completionId: { name: "completionId" },
    score: { name: "score" },
    response: { name: "response" },
    day: { name: "day" },
    createdAt: { name: "createdAt" },
  },
  enrollment: {
    _name: "enrollment",
    id: { name: "id" },
    learnerId: { name: "learnerId" },
    programSlug: { name: "programSlug" },
    status: { name: "status" },
    config: { name: "config" },
    programVersionId: { name: "programVersionId" },
  },
  skillState: {
    _name: "skill_state",
    id: { name: "id" },
    learnerId: { name: "learnerId" },
    skill: { name: "skill" },
  },
  reviewSchedule: {
    _name: "review_schedule",
    id: { name: "id" },
    learnerId: { name: "learnerId" },
    skill: { name: "skill" },
    programSlug: { name: "programSlug" },
    nextReviewOn: { name: "nextReviewOn" },
  },
  starLedger: { _name: "star_ledger" },
  // Adventure 2.0 quest fold (applyAttemptToQuests, src/lib/quests/store.ts —
  // imported by recordAttempt and resolved against this SAME mocked module).
  learnerQuest: {
    _name: "learner_quest",
    id: {},
    learnerId: {},
    programSlug: {},
    assignedOn: {},
    status: {},
  },
  questTemplate: { _name: "quest_template" },
  skill: { _name: "skill" },
  // C1 checkpoint capture (upsertCheckpointScore, src/lib/tutor/store.ts).
  checkpointResult: {
    _name: "checkpoint_result",
    id: {},
    learnerId: {},
    enrollmentId: {},
    unitId: {},
    phase: {},
    createdAt: {},
  },
  generatedActivity: {
    _name: "generated_activity",
    id: { name: "id" },
    learnerId: { name: "learnerId" },
    programSlug: { name: "programSlug" },
    programVersionId: { name: "programVersionId" },
    unitKey: { name: "unitKey" },
    lessonId: { name: "lessonId" },
    kind: { name: "kind" },
    title: { name: "title" },
    config: { name: "config" },
    skillTags: { name: "skillTags" },
    genModel: { name: "genModel" },
    genRoute: { name: "genRoute" },
    genAt: { name: "genAt" },
    createdAt: { name: "createdAt" },
  },
  oralReadingVerification: {
    _name: "oral_reading_verification",
    id: { name: "id" },
    learnerId: { name: "learnerId" },
    programSlug: { name: "programSlug" },
    unitKey: { name: "unitKey" },
    activityId: { name: "activityId" },
    mode: { name: "mode" },
    result: { name: "result" },
    perWord: { name: "perWord" },
    correctCount: { name: "correctCount" },
    totalWords: { name: "totalWords" },
    wcpm: { name: "wcpm" },
    expiresAt: { name: "expiresAt" },
    consumedCompletionId: { name: "consumedCompletionId" },
  },
}));
// drizzle-orm operators are used only to build opaque predicate objects here.
vi.mock("drizzle-orm", () => ({
  and: (...conditions: Predicate[]) => ({ op: "and", conditions }),
  eq: (column: { name?: string }, value: unknown) => ({ op: "eq", column: column?.name, value }),
  lte: (column: { name?: string }, value: unknown) => ({ op: "lte", column: column?.name, value }),
  desc: (column: { name?: string }) => ({ direction: "desc", column: column?.name }),
  asc: (column: { name?: string }) => ({ direction: "asc", column: column?.name }),
  inArray: (...a: unknown[]) => a,
}));

vi.mock("@/lib/content/repository", () => ({
  resolveAccountLearnerProgram: vi.fn(),
}));

import {
  applyPlacement,
  CompletionReplayMismatchError,
  EnrollmentNotActiveError,
  GeneratedActivityAlreadyCompletedError,
  getDueReviews,
  getCompletedActivityIdsForVersion,
  getFluencyHistory,
  getPlayableGeneratedActivity,
  getPendingCheckpointResults,
  nextSkillRecord,
  createOralReadingVerification,
  recordAttempt,
  recordOralReadingAttempt,
  redoCheckpoint,
} from "./store";
import { resolveAccountLearnerProgram } from "@/lib/content/repository";
import type { ActivityScore, Program } from "@/content";

const input = {
  learnerId: "L1",
  programSlug: "kaelyn-adaptive",
  expectedProgramVersionId: "PV1",
  unitId: "unit-1",
  completionId: "11111111-1111-4111-8111-111111111111",
  activityId: "act-1",
  kind: "math",
  score: {
    correct: 3,
    total: 3,
    stars: 3 as const,
    skillEvidence: [{ skill: "math.add", outcome: "solid" as const }],
  },
  day: "2026-06-15",
  creditEligible: true,
};

/** The shared happy-path input, factored to a call so quest-fold tests read
 *  like the brief (recordAttempt("acct-1", baseInput())) without mutating the
 *  shared `input` object other tests reuse. */
function baseInput(): typeof input {
  return input;
}

describe("getCompletedActivityIdsForVersion (generation witness)", () => {
  beforeEach(() => {
    learnerRows.value = [{ id: "L1" }];
    completedTodayRows.value = [
      {
        learnerId: "L1",
        activityId: "same-stable-id",
        generated: false,
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV0",
        score: { stars: 3 },
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        learnerId: "L1",
        activityId: "current-id",
        generated: false,
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        score: { stars: 2 },
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    ];
  });

  it("includes only authored completions from the exact program version", async () => {
    await expect(
      getCompletedActivityIdsForVersion(
        "acct-1",
        "L1",
        "kaelyn-adaptive",
        "PV1",
      ),
    ).resolves.toEqual([{ activityId: "current-id", stars: 2 }]);
  });
});

describe("getPlayableGeneratedActivity (selected learner boundary)", () => {
  const generatedRow = {
    id: "gen-1",
    learnerId: "L1",
    programSlug: "kaelyn-adaptive",
    programVersionId: "PV1",
    unitKey: "unit-1",
    lessonId: "lesson-1",
    kind: "math-tenframe",
    title: "Made for you",
    config: { target: 5 },
    skillTags: ["math.add"],
    genModel: "ha-assist",
    genRoute: "ready",
    genAt: new Date("2026-07-15T12:00:00.000Z"),
    createdAt: new Date("2026-07-15T12:00:00.000Z"),
  };

  beforeEach(() => {
    ops.length = 0;
    learnerRows.value = [{ id: "L1" }];
    generatedActivityRows.value = [generatedRow];
    generatedCompletionRows.value = [];
  });

  it("returns a bounded playable DTO including its owning learner", async () => {
    await expect(
      getPlayableGeneratedActivity(
        "acct-1",
        "L1",
        "kaelyn-adaptive",
        "PV1",
        "gen-1",
      ),
    ).resolves.toEqual({
      id: "gen-1",
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      programVersionId: "PV1",
      unitKey: "unit-1",
      lessonId: "lesson-1",
      kind: "math-tenframe",
      title: "Made for you",
      config: { target: 5 },
      skillTags: ["math.add"],
      gen: {
        model: "ha-assist",
        route: "ready",
        at: "2026-07-15T12:00:00.000Z",
      },
    });
  });

  it("returns null for another learner under the same account", async () => {
    await expect(
      getPlayableGeneratedActivity(
        "acct-1",
        "L2",
        "kaelyn-adaptive",
        "PV1",
        "gen-1",
      ),
    ).resolves.toBeNull();
  });

  it("returns null when the selected learner's row belongs to another program", async () => {
    await expect(
      getPlayableGeneratedActivity(
        "acct-1",
        "L1",
        "world-languages",
        "PV1",
        "gen-1",
      ),
    ).resolves.toBeNull();
  });

  it("returns null when the shelf row belongs to another pinned version", async () => {
    await expect(
      getPlayableGeneratedActivity(
        "acct-1",
        "L1",
        "kaelyn-adaptive",
        "PV2",
        "gen-1",
      ),
    ).resolves.toBeNull();
  });

  it("returns null for a spent one-shot shelf id", async () => {
    generatedCompletionRows.value = [
      {
        learnerId: "L1",
        activityId: "gen-1",
        generated: true,
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        completionId: "already-completed",
      },
    ];

    await expect(
      getPlayableGeneratedActivity(
        "acct-1",
        "L1",
        "kaelyn-adaptive",
        "PV1",
        "gen-1",
      ),
    ).resolves.toBeNull();
  });

  it("treats a legacy generated attempt with nullable identity as spent", async () => {
    generatedCompletionRows.value = [
      {
        learnerId: "L1",
        activityId: "gen-1",
        generated: true,
        programSlug: null,
        programVersionId: null,
        completionId: "legacy-completion",
      },
    ];

    await expect(
      getPlayableGeneratedActivity(
        "acct-1",
        "L1",
        "kaelyn-adaptive",
        "PV1",
        "gen-1",
      ),
    ).resolves.toBeNull();
  });
});

describe("oral-reading verification witness store", () => {
  const completionId = "33333333-3333-4333-8333-333333333333";
  const verificationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const score = {
    correct: 1,
    total: 1,
    stars: 3 as const,
    skillEvidence: [{ skill: "word.sight", outcome: "solid" as const }],
  };
  const response = { attempts: 1, results: ["matched"], fallbackUsed: false };
  const witness = {
    id: verificationId,
    learnerId: "L1",
    programSlug: "kaelyn-adaptive",
    programVersionId: "PV1",
    unitKey: "unit-1",
    activityId: "oral-1",
    mode: "word",
    result: "matched",
    perWord: null,
    correctCount: 1,
    totalWords: 1,
    wcpm: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    consumedCompletionId: null,
  };

  const canonicalize = vi.fn(
    (_facts: unknown): { response: unknown; score: ActivityScore } | null => ({
      response,
      score,
    }),
  );
  const oralInput = () => ({
    learnerId: "L1",
    programSlug: "kaelyn-adaptive",
    expectedProgramVersionId: "PV1",
    completionId,
    unitKey: "unit-1",
    activityId: "oral-1",
    verificationId,
    day: "2026-07-15" as const,
    checkpointPhase: null,
    canonicalize,
  });

  beforeEach(() => {
    ops.length = 0;
    attemptInserts.length = 0;
    ledgerInserts.length = 0;
    lockedSkills.length = 0;
    oralVerificationInserts.length = 0;
    oralVerificationUpdates.length = 0;
    transaction.mockClear();
    learnerRows.value = [{ id: "L1", settings: { oralReading: true } }];
    enrollmentRows.value = [
      {
        id: "E1",
        status: "active",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        config: {},
      },
    ];
    skillRows.value = [{ id: "S1", evidence: [] }];
    attemptRows.value = [{ id: "new" }];
    attemptInsertResultRows.value = [{ id: "new" }];
    attemptReplayRows.value = [];
    generatedCompletionRows.value = [];
    oralVerificationRows.value = [{ ...witness }];
    questRows.value = [];
    reviewScheduleRows.value = [];
    canonicalize.mockReset();
    canonicalize.mockImplementation((_facts: unknown) => ({ response, score }));
  });

  it("locks, records, and deletes the claimed witness in one transaction", async () => {
    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toEqual(score);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(canonicalize).toHaveBeenCalledWith({
      mode: "word",
      result: "matched",
      perWord: null,
      correctCount: 1,
      totalWords: 1,
      wcpm: null,
    });
    expect(attemptInserts[0]).toMatchObject({
      learnerId: "L1",
      activityId: "oral-1",
      kind: "oral-reading",
      completionId,
      programSlug: "kaelyn-adaptive",
      unitKey: "unit-1",
      programVersionId: "PV1",
      response,
      score,
    });
    expect(oralVerificationUpdates).toEqual([]);
    const lockIndex = ops.findIndex(
      (operation) =>
        operation.op === "select.for" && operation.table === "oral_reading_verification",
    );
    const attemptIndex = ops.findIndex(
      (operation) => operation.op === "insert" && operation.table === "attempt",
    );
    const claimIndex = ops
      .map(
        (operation) =>
          operation.op === "delete" && operation.table === "oral_reading_verification",
      )
      .lastIndexOf(true);
    expect(lockIndex).toBeLessThan(attemptIndex);
    expect(attemptIndex).toBeLessThan(claimIndex);
  });

  it.each([
    ["learner", { learnerId: "L2" }],
    ["unit", { unitKey: "unit-2" }],
    ["activity", { activityId: "oral-2" }],
  ])("rejects a cross-%s witness without writing an attempt", async (_label, mismatch) => {
    await expect(
      recordOralReadingAttempt("acct-1", { ...oralInput(), ...mismatch }),
    ).resolves.toBeNull();
    expect(attemptInserts).toEqual([]);
    expect(oralVerificationUpdates).toEqual([]);
  });

  it("rejects a cross-program claim at the locked enrollment boundary", async () => {
    await expect(
      recordOralReadingAttempt("acct-1", {
        ...oralInput(),
        programSlug: "world-languages",
      }),
    ).rejects.toBeInstanceOf(EnrollmentNotActiveError);
    expect(attemptInserts).toEqual([]);
  });

  it("rejects a learner not owned by the account before reading the witness", async () => {
    learnerRows.value = [
      { id: "L1", accountId: "acct-1", settings: { oralReading: true } },
    ];
    await expect(recordOralReadingAttempt("other-account", oralInput())).resolves.toBeNull();
    expect(ops.some((operation) => operation.table === "oral_reading_verification")).toBe(false);
    expect(attemptInserts).toEqual([]);
  });

  it("rejects a witness when only a different program enrollment exists", async () => {
    enrollmentRows.value = [
      {
        id: "E2",
        learnerId: "L1",
        programSlug: "world-languages",
        status: "active",
        config: {},
      },
    ];

    await expect(recordOralReadingAttempt("acct-1", oralInput())).rejects.toBeInstanceOf(
      EnrollmentNotActiveError,
    );
    expect(attemptInserts).toEqual([]);
  });

  it("rejects an expired unconsumed witness", async () => {
    oralVerificationRows.value = [
      { ...witness, expiresAt: new Date("2000-01-01T00:00:00.000Z") },
    ];
    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toBeNull();
    expect(attemptInserts).toEqual([]);
  });

  it("rejects a witness consumed by another completion", async () => {
    oralVerificationRows.value = [
      {
        ...witness,
        consumedCompletionId: "44444444-4444-4444-8444-444444444444",
      },
    ];
    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toBeNull();
    expect(attemptInserts).toEqual([]);
  });

  it("replays the original completion after its consumed witness has been deleted", async () => {
    const originalScore = { ...score, stars: 2 as const };
    oralVerificationRows.value = [];
    attemptReplayRows.value = [
      { activityId: "oral-1", kind: "oral-reading", generated: false, score: originalScore },
    ];
    canonicalize.mockImplementationOnce(() => null);

    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toEqual(
      originalScore,
    );
    expect(canonicalize).not.toHaveBeenCalled();
    expect(oralVerificationUpdates).toEqual([]);
    expect(lockedSkills).toEqual([]);
  });

  it.each([
    ["program", { programSlug: "world-languages" }],
    ["unit", { unitKey: "unit-2" }],
    ["version", { programVersionId: "PV2" }],
    ["legacy null program", { programSlug: null }],
    ["legacy null unit", { unitKey: null }],
  ])("rejects an oral replay with a different %s identity", async (_label, mismatch) => {
    oralVerificationRows.value = [];
    attemptReplayRows.value = [
      {
        activityId: "oral-1",
        kind: "oral-reading",
        generated: false,
        score,
        ...mismatch,
      },
    ];

    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toBeNull();
    expect(attemptInserts).toEqual([]);
  });

  it("rejects a witness issued for a previous enrollment version", async () => {
    oralVerificationRows.value = [{ ...witness, programVersionId: "PV0" }];

    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toBeNull();
    expect(attemptInserts).toEqual([]);
  });

  it("rejects a replay whose stored activity identity does not match", async () => {
    oralVerificationRows.value = [];
    attemptReplayRows.value = [
      { activityId: "oral-2", kind: "oral-reading", generated: false, score },
    ];
    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toBeNull();
    expect(attemptInserts).toEqual([]);
  });

  it("rejects a first witness claim when microphone consent was revoked", async () => {
    learnerRows.value = [{ id: "L1", settings: { oralReading: false } }];

    await expect(recordOralReadingAttempt("acct-1", oralInput())).resolves.toBeNull();

    expect(canonicalize).not.toHaveBeenCalled();
    expect(attemptInserts).toEqual([]);
    expect(oralVerificationRows.value).toHaveLength(1);
  });

  it("records no-witness completion as server-canonical participation only", async () => {
    canonicalize.mockImplementationOnce((facts) => {
      expect(facts).toBeNull();
      return {
        response: { attempts: 0, results: [], fallbackUsed: true },
        score: { correct: 0, total: 0, stars: 1, skillEvidence: [] },
      };
    });
    await expect(
      recordOralReadingAttempt("acct-1", { ...oralInput(), verificationId: undefined }),
    ).resolves.toMatchObject({ total: 0, skillEvidence: [] });
    expect(
      ops.some(
        (operation) =>
          operation.op === "select" && operation.table === "oral_reading_verification",
      ),
    ).toBe(false);
  });

  it("rechecks microphone consent and active-unit curation in the witness transaction", async () => {
    learnerRows.value = [{ id: "L1", settings: { oralReading: true } }];
    enrollmentRows.value = [
      {
        id: "E1",
        status: "active",
        programSlug: "kaelyn-adaptive",
        config: { activeUnitKeys: ["unit-1"] },
      },
    ];

    await expect(
      createOralReadingVerification("acct-1", {
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        expectedProgramVersionId: "PV1",
        unitKey: "unit-1",
        activityId: "oral-1",
        mode: "word",
        result: "matched",
        perWord: null,
        correctCount: 1,
        totalWords: 1,
        wcpm: null,
      }),
    ).resolves.toBe(verificationId);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(oralVerificationInserts).toHaveLength(1);
    expect(oralVerificationInserts[0]).toMatchObject({
      learnerId: "L1",
      programVersionId: "PV1",
      unitKey: "unit-1",
      activityId: "oral-1",
    });
  });

  it("refuses a witness when consent is off, the unit is curated out, or config is malformed", async () => {
    const input = {
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      expectedProgramVersionId: "PV1",
      unitKey: "unit-1",
      activityId: "oral-1",
      mode: "word" as const,
      result: "matched" as const,
      perWord: null,
      correctCount: 1,
      totalWords: 1 as const,
      wcpm: null,
    };

    learnerRows.value = [{ id: "L1", settings: { oralReading: false } }];
    await expect(createOralReadingVerification("acct-1", input)).resolves.toBeNull();

    learnerRows.value = [{ id: "L1", settings: { oralReading: true } }];
    enrollmentRows.value = [
      { id: "E1", status: "active", config: { activeUnitKeys: ["unit-2"] } },
    ];
    await expect(createOralReadingVerification("acct-1", input)).resolves.toBeNull();

    enrollmentRows.value = [
      { id: "E1", status: "active", config: { activeUnitKeys: "unit-1" } },
    ];
    await expect(createOralReadingVerification("acct-1", input)).resolves.toBeNull();

    expect(oralVerificationInserts).toEqual([]);
  });

  it("refuses witness creation after the enrollment is repinned", async () => {
    enrollmentRows.value = [
      {
        id: "E1",
        status: "active",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV2",
        config: {},
      },
    ];

    await expect(
      createOralReadingVerification("acct-1", {
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        expectedProgramVersionId: "PV1",
        unitKey: "unit-1",
        activityId: "oral-1",
        mode: "word",
        result: "matched",
        perWord: null,
        correctCount: 1,
        totalWords: 1,
        wcpm: null,
      }),
    ).resolves.toBeNull();
    expect(oralVerificationInserts).toEqual([]);
  });

  it("rejects inconsistent word facts before any database read", async () => {
    await expect(
      createOralReadingVerification("acct-1", {
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        expectedProgramVersionId: "PV1",
        unitKey: "unit-1",
        activityId: "oral-1",
        mode: "word",
        result: "unclear",
        perWord: null,
        correctCount: 1,
        totalWords: 1,
        wcpm: null,
      }),
    ).rejects.toThrow(/result mismatch/i);
    expect(ops).toEqual([]);
  });
});

describe("recordAttempt (atomic persistence)", () => {
  beforeEach(() => {
    ops.length = 0;
    lockedSkills.length = 0;
    attemptInserts.length = 0;
    ledgerInserts.length = 0;
    questUpdates.length = 0;
    checkpointUpdates.length = 0;
    skillStateUpdates.length = 0;
    reviewScheduleInserts.length = 0;
    transaction.mockClear();
    learnerRows.value = [{ id: "L1" }];
    skillRows.value = [];
    enrollmentRows.value = [
      { id: "E1", status: "active", programSlug: "kaelyn-adaptive", config: {} },
    ];
    attemptRows.value = [{ id: "new" }];
    attemptInsertResultRows.value = [{ id: "new" }];
    attemptReplayRows.value = [];
    generatedCompletionRows.value = [];
    questRows.value = [];
    checkpointResultRows.value = [{ id: "CR1", scores: {} }];
    reviewScheduleRows.value = [];
    completedTodayRows.value = [];
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

  it("persists the completion id and returns the stored canonical score", async () => {
    skillRows.value = [{ id: "S1", evidence: [] }];

    await expect(recordAttempt("acct-1", input)).resolves.toEqual(input.score);
    expect(attemptInserts[0]).toMatchObject({
      completionId: input.completionId,
      programSlug: input.programSlug,
      unitKey: input.unitId,
      programVersionId: input.expectedProgramVersionId,
    });
    expect(ops).toContainEqual({ op: "onConflictDoNothing", table: "attempt" });
  });

  it("replays the original score and skips every non-checkpoint fold", async () => {
    const storedScore = {
      correct: 1,
      total: 3,
      stars: 1 as const,
      skillEvidence: [{ skill: "math.add", outcome: "emerging" as const }],
    };
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [
      {
        activityId: input.activityId,
        kind: input.kind,
        generated: false,
        score: storedScore,
      },
    ];
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];

    await expect(
      recordAttempt("acct-1", {
        ...input,
        score: { ...input.score, stars: 3 },
      }),
    ).resolves.toEqual(storedScore);

    expect(ledgerInserts).toEqual([]);
    expect(lockedSkills).toEqual([]);
    expect(reviewScheduleInserts).toEqual([]);
    expect(questUpdates).toEqual([]);
    expect(checkpointUpdates).toEqual([]);
  });

  it("aborts before every fold when the DB privacy trigger suppresses an unsafe insert", async () => {
    const rawSentinel = "private child journal sentinel";
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [];
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];

    const error = await recordAttempt("acct-1", {
      ...input,
      kind: "journal-prompt",
      response: { text: rawSentinel },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("completion id conflict could not be replayed");
    expect((error as Error).message).not.toContain(rawSentinel);
    expect(skillStateUpdates).toEqual([]);
    expect(reviewScheduleInserts).toEqual([]);
    expect(questUpdates).toEqual([]);
    expect(ledgerInserts).toEqual([]);
    expect(checkpointUpdates).toEqual([]);
  });

  it("skips the checkpoint fold when replaying a checkpoint completion", async () => {
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [
      {
        activityId: input.activityId,
        kind: input.kind,
        generated: false,
        score: input.score,
      },
    ];

    await recordAttempt("acct-1", { ...input, checkpointPhase: "baseline" });

    expect(checkpointUpdates).toEqual([]);
    expect(ops.some((operation) => operation.table === "checkpoint_result")).toBe(false);
  });

  it.each([
    ["activity id", { activityId: "act-other" }],
    ["kind", { kind: "reading" }],
    ["generated identity", { generated: true }],
  ])("rejects a completion replay with a different %s", async (_label, identity) => {
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [
      {
        activityId: input.activityId,
        kind: input.kind,
        generated: false,
        score: input.score,
      },
    ];

    await expect(recordAttempt("acct-1", { ...input, ...identity })).rejects.toThrow(
      /completion id/i,
    );
    expect(ledgerInserts).toEqual([]);
    expect(lockedSkills).toEqual([]);
    expect(reviewScheduleInserts).toEqual([]);
    expect(questUpdates).toEqual([]);
    expect(checkpointUpdates).toEqual([]);
  });

  it.each([
    ["program", { programSlug: "world-languages" }],
    ["unit", { unitKey: "unit-2" }],
    ["version", { programVersionId: "PV2" }],
    ["legacy null program", { programSlug: null }],
    ["legacy null unit", { unitKey: null }],
  ])("rejects a completion replay with a different stored %s", async (_label, mismatch) => {
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [
      {
        activityId: input.activityId,
        kind: input.kind,
        generated: false,
        score: input.score,
        ...mismatch,
      },
    ];

    await expect(recordAttempt("acct-1", input)).rejects.toBeInstanceOf(
      CompletionReplayMismatchError,
    );
    expect(ledgerInserts).toEqual([]);
    expect(lockedSkills).toEqual([]);
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
    enrollmentRows.value = [{ id: "E1", status: "active", config: {} }];
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

  it("treats an empty activeUnitKeys list as all units active", async () => {
    enrollmentRows.value = [
      { id: "E1", status: "active", config: { activeUnitKeys: [] } },
    ];
    skillRows.value = [{ id: "S1", evidence: [] }];

    await expect(
      recordAttempt("acct-1", { ...input, unitId: "unit-not-listed" }),
    ).resolves.toEqual(input.score);
    expect(attemptInserts).toHaveLength(1);
  });

  it.each([
    ["authored", { generated: false, creditEligible: true, shelfEligible: false }],
    ["generated shelf", { generated: true, creditEligible: false, shelfEligible: true }],
  ])(
    "rejects a %s attempt when activeUnitKeys excludes its unit before any write",
    async (_label, attemptIdentity) => {
      enrollmentRows.value = [
        {
          id: "E1",
          status: "active",
          config: { activeUnitKeys: ["unit-2"] },
        },
      ];

      await expect(
        recordAttempt("acct-1", {
          ...input,
          ...attemptIdentity,
          unitId: "unit-1",
        }),
      ).rejects.toBeInstanceOf(EnrollmentNotActiveError);

      expect(ops).toContainEqual({ op: "select.for", table: "enrollment" });
      expect(ops.some((operation) => operation.table === "attempt")).toBe(false);
      expect(ledgerInserts).toEqual([]);
    },
  );

  it("rejects a blank attempt unit when activeUnitKeys is nonempty", async () => {
    enrollmentRows.value = [
      {
        id: "E1",
        status: "active",
        config: { activeUnitKeys: ["unit-1"] },
      },
    ];

    await expect(
      recordAttempt("acct-1", { ...input, unitId: "" }),
    ).rejects.toBeInstanceOf(EnrollmentNotActiveError);
    expect(ops.some((operation) => operation.table === "attempt")).toBe(false);
  });

  it("fails closed on malformed locked enrollment config before any write", async () => {
    enrollmentRows.value = [
      {
        id: "E1",
        status: "active",
        config: { activeUnitKeys: "unit-1" },
      },
    ];

    await expect(
      recordAttempt("acct-1", { ...input, unitId: "unit-1" }),
    ).rejects.toBeInstanceOf(EnrollmentNotActiveError);
    expect(ops.some((operation) => operation.table === "attempt")).toBe(false);
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

  // ── Phase 3: spaced-repetition schedule fold ─────────────────────────────

  it("starts a one-day schedule when the folded skill first becomes solid", async () => {
    skillRows.value = [
      { id: "S1", evidence: [{ day: "2026-06-13", outcome: "solid" }] },
    ];

    await recordAttempt("acct-1", input);

    expect(reviewScheduleInserts).toEqual([
      expect.objectContaining({
        learnerId: "L1",
        skill: "math.add",
        programSlug: "kaelyn-adaptive",
        intervalIndex: 0,
        nextReviewOn: "2026-06-16",
        lastReviewedOn: null,
        lastOutcome: "solid",
      }),
    ]);
  });

  it("promotes a passed review to the next ladder interval", async () => {
    skillRows.value = [
      { id: "S1", evidence: [{ day: "2026-06-13", outcome: "solid" }] },
    ];
    reviewScheduleRows.value = [
      {
        id: "R1",
        learnerId: "L1",
        skill: "math.add",
        programSlug: "kaelyn-adaptive",
        intervalIndex: 0,
        nextReviewOn: "2026-06-15",
        lastReviewedOn: null,
        lastOutcome: "solid",
      },
    ];

    await recordAttempt("acct-1", input);

    expect(reviewScheduleInserts).toContainEqual(
      expect.objectContaining({
        intervalIndex: 1,
        nextReviewOn: "2026-06-18",
        lastReviewedOn: "2026-06-15",
        lastOutcome: "solid",
      }),
    );
  });

  it("demotes a struggled review even though mastery remains durably solid", async () => {
    skillRows.value = [
      {
        id: "S1",
        evidence: [
          { day: "2026-06-12", outcome: "solid" },
          { day: "2026-06-13", outcome: "solid" },
        ],
      },
    ];
    reviewScheduleRows.value = [
      {
        id: "R1",
        learnerId: "L1",
        skill: "math.add",
        programSlug: "kaelyn-adaptive",
        intervalIndex: 2,
        nextReviewOn: "2026-06-15",
        lastReviewedOn: "2026-06-08",
        lastOutcome: "solid",
      },
    ];

    await recordAttempt("acct-1", {
      ...input,
      score: {
        ...input.score,
        skillEvidence: [{ skill: "math.add", outcome: "emerging" }],
      },
    });

    expect(reviewScheduleInserts).toContainEqual(
      expect.objectContaining({
        intervalIndex: 0,
        nextReviewOn: "2026-06-16",
        lastReviewedOn: "2026-06-15",
        lastOutcome: "emerging",
      }),
    );
  });

  it("does not touch a not-yet-due schedule on incidental practice (no thrash)", async () => {
    skillRows.value = [
      { id: "S1", evidence: [{ day: "2026-06-13", outcome: "solid" }] },
    ];
    // Scheduled for a future review; this attempt (day 2026-06-15) is normal
    // adventure practice, not the due review, so the ladder must not move.
    reviewScheduleRows.value = [
      {
        id: "R1",
        learnerId: "L1",
        skill: "math.add",
        programSlug: "kaelyn-adaptive",
        intervalIndex: 2,
        nextReviewOn: "2026-06-20",
        lastReviewedOn: "2026-06-13",
        lastOutcome: "solid",
      },
    ];

    await recordAttempt("acct-1", input);

    expect(reviewScheduleInserts).toHaveLength(0);
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

  // ── Adventure 2.0 B3: a generated SHELF item earns exactly once ────────────

  it("credits the ledger for a generated shelf item's FIRST completion (shelfEligible)", async () => {
    // A generated attempt would normally earn 0, but a server-verified shelf item
    // (shelfEligible) is a one-time earner. creditEligible is false (it is not an
    // authored-tree activity); shelfEligible alone opens the earn.
    await recordAttempt("acct-1", {
      ...input,
      generated: true,
      creditEligible: false,
      shelfEligible: true,
    });
    expect(ledgerInserts).toEqual([
      expect.objectContaining({ delta: 3, reason: "activity_complete", refId: input.activityId }),
    ]);
  });

  it("rejects a second completion id for a one-shot generated shelf item before any fold", async () => {
    generatedCompletionRows.value = [
      {
        learnerId: "L1",
        activityId: input.activityId,
        generated: true,
        completionId: "prior-completion",
      },
    ];
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];

    await expect(
      recordAttempt("acct-1", {
        ...input,
        generated: true,
        creditEligible: false,
        shelfEligible: true,
      }),
    ).rejects.toBeInstanceOf(GeneratedActivityAlreadyCompletedError);

    expect(attemptInserts).toEqual([]);
    expect(skillStateUpdates).toEqual([]);
    expect(reviewScheduleInserts).toEqual([]);
    expect(questUpdates).toEqual([]);
    expect(ledgerInserts).toEqual([]);
    const enrollmentLock = ops.findIndex(
      (operation) => operation.op === "select.for" && operation.table === "enrollment",
    );
    const completionRead = ops.findIndex(
      (operation) => operation.op === "select" && operation.table === "attempt",
    );
    expect(enrollmentLock).toBeGreaterThanOrEqual(0);
    expect(completionRead).toBeGreaterThan(enrollmentLock);
  });

  it("fails closed before every fold when the DB one-shot guard suppresses a raced shelf insert", async () => {
    // The app precheck saw no prior completion, but the permanent DB trigger
    // suppressed the INSERT after a serialized winner committed.
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [];
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];

    const error = await recordAttempt("acct-1", {
      ...input,
      generated: true,
      creditEligible: false,
      shelfEligible: true,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("completion id conflict could not be replayed");
    expect(attemptInserts).toHaveLength(1);
    expect(skillStateUpdates).toEqual([]);
    expect(reviewScheduleInserts).toEqual([]);
    expect(questUpdates).toEqual([]);
    expect(ledgerInserts).toEqual([]);
    expect(checkpointUpdates).toEqual([]);
  });

  it("still replays the same completion id for a one-shot generated shelf item", async () => {
    const storedScore = {
      correct: 0,
      total: 1,
      stars: 1 as const,
      skillEvidence: [{ skill: "math.add", outcome: "emerging" as const }],
    };
    generatedCompletionRows.value = [
      {
        learnerId: "L1",
        activityId: input.activityId,
        generated: true,
        completionId: input.completionId,
      },
    ];
    attemptInsertResultRows.value = [];
    attemptReplayRows.value = [
      {
        activityId: input.activityId,
        kind: input.kind,
        generated: true,
        score: storedScore,
      },
    ];

    await expect(
      recordAttempt("acct-1", {
        ...input,
        generated: true,
        creditEligible: false,
        shelfEligible: true,
      }),
    ).resolves.toEqual(storedScore);

    expect(skillStateUpdates).toEqual([]);
    expect(reviewScheduleInserts).toEqual([]);
    expect(questUpdates).toEqual([]);
    expect(ledgerInserts).toEqual([]);
  });

  it("a generated NON-shelf attempt still earns nothing (shelfEligible absent)", async () => {
    // Guards the byte-identical authored/in-session-practice path: without the
    // shelf witness, generated practice earns 0 even on a first completion.
    await recordAttempt("acct-1", { ...input, generated: true, creditEligible: true });
    expect(ledgerInserts).toHaveLength(0);
  });

  // ── Codex critical: server-verified membership gates the star earn ─────────

  it("writes no ledger row for a first authored completion when creditEligible is false", async () => {
    // Default attemptRows.value is a single row (first authored completion) —
    // without the membership gate this would credit the ledger. A forged
    // fresh activityId (unresolvable/unverified against the learner's pinned
    // tree) must mint zero stars even though it looks like a first completion.
    skillRows.value = [{ id: "S1", evidence: [] }];
    await recordAttempt("acct-1", { ...input, creditEligible: false });
    expect(ledgerInserts).toHaveLength(0);
    // The attempt row and skill fold are still written — only the star credit
    // is withheld.
    expect(attemptInserts).toHaveLength(1);
    expect(ops).toContainEqual({ op: "update", table: "skill_state" });
  });

  // ── Adventure 2.0: quest fold + reward credit, INSIDE the attempt tx ────────

  it("folds an active quest and credits its reward inside the attempt tx", async () => {
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];
    await recordAttempt("acct-1", baseInput());
    expect(questUpdates).toContainEqual(
      expect.objectContaining({ status: "done", progress: { done: 1 } }),
    );
    expect(ledgerInserts).toContainEqual(
      expect.objectContaining({ delta: 2, reason: "quest_complete", refId: "Q1" }),
    );
  });

  it("leaves offered quests untouched", async () => {
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "offered",
      },
    ];
    await recordAttempt("acct-1", baseInput());
    expect(questUpdates).toHaveLength(0);
  });

  // Finding 1 (review): applyAttemptToQuests must be program-scoped — an
  // active quest assigned for a DIFFERENT program than the recorded attempt
  // must not fold or credit, the same way a learner enrolled in both
  // kaelyn-adaptive and world-languages can't have one program's activity
  // complete the other's quest.
  it("does not fold or credit an active quest from a different program", async () => {
    questRows.value = [
      {
        id: "Q1",
        programSlug: "world-languages", // baseInput()'s attempt is for kaelyn-adaptive
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];
    await recordAttempt("acct-1", baseInput());
    expect(questUpdates).toHaveLength(0);
    expect(ledgerInserts.some((l) => l.reason === "quest_complete")).toBe(false);
  });

  // Finding 2 (review): a corrupt jsonb column (target/progress fails its zod
  // schema) must fail CLOSED — the row is skipped entirely, so it can never
  // fold, complete, or credit stars off corrupt data.
  it("does not fold, complete, or credit a quest with a corrupt target", async () => {
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: {}, // missing required `count` — fails questTargetSchema
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];
    await recordAttempt("acct-1", baseInput());
    expect(questUpdates).toHaveLength(0);
    expect(ledgerInserts.some((l) => l.reason === "quest_complete")).toBe(false);
  });

  // ── Codex round 2, Important #1: questEligible = generated || creditEligible ──
  // (closes the quest-credit leak on the program-unresolvable branch, while
  // preserving generated practice's ability to fold complete_n quests).

  it("does not fold or credit a quest for an AUTHORED attempt when creditEligible is false", async () => {
    // Program-unresolvable branch: membership couldn't be verified, so the
    // star-ledger earn is already withheld (existing test above); this asserts
    // applyAttemptToQuests is skipped entirely too — no quest UPDATE and no
    // quest_complete ledger insert, even though an active quest would
    // otherwise complete on this attempt.
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];
    await recordAttempt("acct-1", { ...baseInput(), generated: false, creditEligible: false });
    expect(questUpdates).toHaveLength(0);
    expect(ledgerInserts.some((l) => l.reason === "quest_complete")).toBe(false);
  });

  it("still folds and credits a quest for GENERATED practice when creditEligible is false", async () => {
    // Design preserved: generated practice legitimately has no authored-tree
    // membership (creditEligible is meaningless/false for it), and must still
    // be able to complete a complete_n quest.
    questRows.value = [
      {
        id: "Q1",
        kind: "complete_n",
        target: { count: 1 },
        progress: { done: 0 },
        rewardStars: 2,
        status: "active",
      },
    ];
    await recordAttempt("acct-1", { ...baseInput(), generated: true, creditEligible: false });
    expect(questUpdates).toContainEqual(
      expect.objectContaining({ status: "done", progress: { done: 1 } }),
    );
    expect(ledgerInserts).toContainEqual(
      expect.objectContaining({ delta: 2, reason: "quest_complete", refId: "Q1" }),
    );
  });

  // ── Adventure 2.0 C1: baseline checkpoint capture (checkpoint_result, NOT
  // skill_state) ───────────────────────────────────────────────────────────

  it("a baseline checkpoint attempt captures to checkpoint_result and NOT skill_state", async () => {
    await recordAttempt("acct-1", { ...baseInput(), unitId: "math-baseline", checkpointPhase: "baseline" });

    // skill_state is untouched: the checkpoint branch skips the fold loop
    // entirely, so no skill_state insert/lock/update ever runs.
    expect(ops.some((o) => o.table === "skill_state")).toBe(false);

    // checkpoint_result is upserted + its scores merged: input.score's single
    // "solid" outcome folds to rate 1 (outcomeToRate).
    expect(ops).toContainEqual({ op: "onConflictDoNothing", table: "checkpoint_result" });
    expect(checkpointUpdates).toContainEqual({ scores: { "math.add": 1 } });

    // The quest fold is also skipped for a checkpoint attempt.
    expect(questUpdates).toHaveLength(0);
    expect(reviewScheduleInserts).toHaveLength(0);
  });

  it("still earns activity stars on a baseline checkpoint attempt", async () => {
    // The star-ledger earn happens ABOVE the checkpoint branch — a checkpoint
    // activity is still ordinary play to the child.
    await recordAttempt("acct-1", { ...baseInput(), unitId: "math-baseline", checkpointPhase: "baseline" });
    expect(ledgerInserts).toContainEqual(
      expect.objectContaining({ delta: 3, reason: "activity_complete" }),
    );
  });

  it("first-write-wins: an already-scored skill is not clobbered by a later attempt", async () => {
    // Simulates a2's clean math.mult.facts probe (rate 1) already captured, then
    // a5 (math-array's area mode) coming in with a stumble on the SAME skill
    // (rate 0.5) plus a brand-new skill it also probes. The prior clean score
    // must survive; the new skill must still be added.
    checkpointResultRows.value = [{ id: "CR1", scores: { "math.mult.facts": 1 } }];
    await recordAttempt("acct-1", {
      ...baseInput(),
      unitId: "math-baseline",
      checkpointPhase: "baseline",
      score: {
        correct: 1,
        total: 2,
        stars: 1 as const,
        skillEvidence: [
          { skill: "math.mult.facts", outcome: "emerging" as const },
          { skill: "math.geometry.area-arrays", outcome: "solid" as const },
        ],
      },
    });

    expect(checkpointUpdates).toContainEqual({
      scores: { "math.mult.facts": 1, "math.geometry.area-arrays": 1 },
    });
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

  // ── Adventure 2.0 C1: source threading (default "play" stays back-compatible) ─

  it("defaults to source \"play\" implicitly (no source field on the entry)", () => {
    const r = nextSkillRecord(undefined, "solid", "2026-06-13");
    expect(r.history[0]).not.toHaveProperty("source");
  });

  it("a baseline entry locks to solid immediately, without a second distinct day", () => {
    const r = nextSkillRecord(undefined, "solid", "2026-06-20", "baseline");
    expect(r.history).toEqual([{ day: "2026-06-20", outcome: "solid", source: "baseline" }]);
    expect(r.outcome).toBe("solid");
  });
});

describe("getFluencyHistory (owned oral-reading history)", () => {
  beforeEach(() => {
    ops.length = 0;
    learnerRows.value = [{ id: "L1" }];
    attemptRows.value = [];
  });

  it("extracts WCPM only from a complete server-canonical oral response", async () => {
    attemptRows.value = [
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-08",
        response: null,
        createdAt: new Date("2026-07-08T10:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-09",
        response: {},
        createdAt: new Date("2026-07-09T10:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-10",
        response: { wcpm: "18" },
        createdAt: new Date("2026-07-10T10:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-11",
        response: { wcpm: Number.NaN },
        createdAt: new Date("2026-07-11T10:00:00Z"),
      },
      {
        // Corrupt/legacy out-of-plausible-range data is dropped defensively.
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-11",
        response: { wcpm: 99999 },
        createdAt: new Date("2026-07-11T11:00:00Z"),
      },
      {
        // A bare browser-like fact is not the canonical stored response shape.
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-11",
        response: { wcpm: 21 },
        createdAt: new Date("2026-07-11T12:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-12",
        response: {
          attempts: 1,
          results: ["matched"],
          fallbackUsed: false,
          wcpm: 22,
        },
        createdAt: new Date("2026-07-12T10:00:00Z"),
      },
    ];

    await expect(getFluencyHistory("acct-1", "L1")).resolves.toEqual([
      { day: "2026-07-12", wcpm: 22 },
    ]);
  });

  it("applies learner and oral-reading filters and keeps the most recent, chronological", async () => {
    attemptRows.value = [
      {
        learnerId: "L1",
        kind: "math-tenframe",
        day: "2026-07-07",
        response: { wcpm: 99 },
        createdAt: new Date("2026-07-07T10:00:00Z"),
      },
      {
        learnerId: "someone-else",
        kind: "oral-reading",
        day: "2026-07-08",
        response: { wcpm: 88 },
        createdAt: new Date("2026-07-08T10:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-12",
        response: { attempts: 1, results: ["matched"], fallbackUsed: false, wcpm: 22 },
        createdAt: new Date("2026-07-12T10:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-10",
        response: { attempts: 1, results: ["matched"], fallbackUsed: false, wcpm: 12 },
        createdAt: new Date("2026-07-10T10:00:00Z"),
      },
      {
        learnerId: "L1",
        kind: "oral-reading",
        day: "2026-07-11",
        response: { attempts: 1, results: ["matched"], fallbackUsed: false, wcpm: 18 },
        createdAt: new Date("2026-07-11T10:00:00Z"),
      },
    ];

    // limit 2 keeps the MOST RECENT two attempts (07-11, 07-12), returned
    // oldest→newest so the chart tracks recent growth, not the first reads ever.
    await expect(getFluencyHistory("acct-1", "L1", 2)).resolves.toEqual([
      { day: "2026-07-11", wcpm: 18 },
      { day: "2026-07-12", wcpm: 22 },
    ]);
  });

  it("fails closed without reading attempts when the learner is not owned", async () => {
    learnerRows.value = [];
    attemptRows.value = [
      { day: "2026-07-12", response: { wcpm: 22 }, createdAt: new Date() },
    ];

    await expect(getFluencyHistory("acct-2", "L1")).resolves.toEqual([]);
    expect(ops.filter((entry) => entry.table === "attempt")).toEqual([]);
  });
});

describe("getPendingCheckpointResults (owned-by-account read)", () => {
  beforeEach(() => {
    learnerRows.value = [{ id: "L1" }];
    checkpointResultRows.value = [];
  });

  it("maps each checkpoint result to its computed placement verdicts + seed", async () => {
    checkpointResultRows.value = [
      {
        id: "CR1",
        unitId: "math-baseline",
        phase: "baseline",
        status: "pending",
        createdAt: new Date("2026-06-20T10:00:00.000Z"),
        scores: { "math.add": 1, "math.sub": 0.4 },
      },
    ];
    const result = await getPendingCheckpointResults("acct-1", "L1");
    expect(result).toEqual([
      {
        id: "CR1",
        unitId: "math-baseline",
        phase: "baseline",
        status: "pending",
        createdAt: "2026-06-20T10:00:00.000Z",
        seed: ["math.add"],
        verdicts: [
          { skill: "math.add", rate: 1, band: "breezed" },
          { skill: "math.sub", rate: 0.4, band: "not_yet" },
        ],
      },
    ]);
  });

  it("returns empty when the learner is not owned by the account", async () => {
    learnerRows.value = [];
    checkpointResultRows.value = [{ id: "CR1", unitId: "u", phase: "baseline", status: "pending", createdAt: new Date(), scores: {} }];
    expect(await getPendingCheckpointResults("acct-2", "L1")).toEqual([]);
  });
});

describe("applyPlacement (parent-gated baseline seed)", () => {
  beforeEach(() => {
    ops.length = 0;
    lockedSkills.length = 0;
    checkpointUpdates.length = 0;
    skillStateUpdates.length = 0;
    reviewScheduleInserts.length = 0;
    transaction.mockClear();
    learnerRows.value = [{ id: "L1" }];
    skillRows.value = [];
    reviewScheduleRows.value = [];
    enrollmentRows.value = [
      { id: "E1", status: "active", programSlug: "kaelyn-adaptive", config: {} },
    ];
    checkpointResultRows.value = [
      {
        id: "CR1",
        learnerId: "L1",
        enrollmentId: "E1",
        unitId: "math-baseline",
        phase: "baseline",
        status: "pending",
        createdAt: new Date("2026-06-20T10:00:00.000Z"),
        scores: { "math.add": 1, "math.sub": 0.6, "math.count": 0.2 },
      },
    ];
  });

  it("seeds ONLY the breezed skill(s) as solid with source \"baseline\"", async () => {
    // Only math.add clears BREEZED_MIN (1 >= 0.8); math.sub is "mixed" and
    // math.count is "not_yet" — neither should be seeded.
    skillRows.value = [{ id: "S-add", evidence: [] }];
    await applyPlacement("acct-1", "CR1");

    expect(lockedSkills).toEqual(["math.add"]);
    expect(skillStateUpdates).toHaveLength(1);
    expect(skillStateUpdates[0]).toMatchObject({
      outcome: "solid",
      evidence: [{ day: "2026-06-20", outcome: "solid", source: "baseline" }],
    });
    expect(reviewScheduleInserts).toContainEqual(
      expect.objectContaining({
        learnerId: "L1",
        skill: "math.add",
        programSlug: "kaelyn-adaptive",
        intervalIndex: 0,
        nextReviewOn: "2026-06-21",
      }),
    );

    // The checkpoint result flips to applied.
    expect(checkpointUpdates).toContainEqual(
      expect.objectContaining({ status: "applied", appliedAt: expect.any(Date) }),
    );
  });

  it("re-applying an already-applied row is a no-op", async () => {
    checkpointResultRows.value[0]!.status = "applied";
    await applyPlacement("acct-1", "CR1");

    expect(lockedSkills).toHaveLength(0);
    expect(skillStateUpdates).toHaveLength(0);
    expect(checkpointUpdates).toHaveLength(0);
  });

  it("rejects when the checkpoint result's learner is not owned by the account", async () => {
    learnerRows.value = []; // simulates a foreign account
    await expect(applyPlacement("acct-2", "CR1")).rejects.toThrow("learner not found");

    expect(lockedSkills).toHaveLength(0);
    expect(skillStateUpdates).toHaveLength(0);
    expect(checkpointUpdates).toHaveLength(0);
  });

  it("no-ops when the checkpoint result does not exist", async () => {
    checkpointResultRows.value = [];
    await applyPlacement("acct-1", "CR-missing");
    expect(skillStateUpdates).toHaveLength(0);
    expect(checkpointUpdates).toHaveLength(0);
  });
});

const DUE_PROGRAM = {
  slug: "kaelyn-adaptive",
  title: "Test world",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [
    {
      id: "numbers",
      order: 1,
      title: "Numbers",
      emoji: "🔢",
      world: "sunshine",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [
        {
          id: "numbers-1",
          order: 1,
          title: "One",
          activities: [
            { id: "a-today", title: "Already warm", kind: "math-tenframe", band: "ready", skillTags: ["math.add"], config: {} },
            { id: "a-review", title: "Add again", kind: "math-tenframe", band: "ready", skillTags: ["math.add"], config: {} },
            { id: "a-future", title: "Later", kind: "math-tenframe", band: "ready", skillTags: ["math.future"], config: {} },
            { id: "a-other", title: "Other world", kind: "math-tenframe", band: "ready", skillTags: ["math.other"], config: {} },
          ],
        },
      ],
    },
    {
      id: "reading",
      order: 2,
      title: "Reading",
      emoji: "📚",
      world: "ocean",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [
        {
          id: "reading-1",
          order: 1,
          title: "One",
          activities: [
            { id: "a-reading", title: "Read again", kind: "reading-comprehension", band: "ready", skillTags: ["reading.fluency"], config: {} },
          ],
        },
      ],
    },
  ],
} as unknown as Program;

describe("getDueReviews (owned authored review read)", () => {
  beforeEach(() => {
    ops.length = 0;
    learnerRows.value = [{ id: "L1" }];
    vi.mocked(resolveAccountLearnerProgram).mockReset();
    reviewScheduleRows.value = [
      { id: "R1", learnerId: "L1", skill: "math.add", programSlug: "kaelyn-adaptive", intervalIndex: 1, nextReviewOn: "2026-07-10", lastReviewedOn: null, lastOutcome: "solid" },
      { id: "R2", learnerId: "L1", skill: "reading.fluency", programSlug: "kaelyn-adaptive", intervalIndex: 0, nextReviewOn: "2026-07-12", lastReviewedOn: null, lastOutcome: "solid" },
      { id: "R3", learnerId: "L1", skill: "math.future", programSlug: "kaelyn-adaptive", intervalIndex: 0, nextReviewOn: "2026-07-14", lastReviewedOn: null, lastOutcome: "solid" },
      { id: "R4", learnerId: "L1", skill: "math.other", programSlug: "another-program", intervalIndex: 0, nextReviewOn: "2026-07-09", lastReviewedOn: null, lastOutcome: "solid" },
    ];
    completedTodayRows.value = [
      { learnerId: "L1", activityId: "a-today", programSlug: "kaelyn-adaptive", programVersionId: "PV1", generated: false, day: "2026-07-13" },
      // Yesterday's completion remains reviewable today.
      { learnerId: "L1", activityId: "a-review", programSlug: "kaelyn-adaptive", programVersionId: "PV1", generated: false, day: "2026-07-12" },
      // Same id today on an old pin cannot suppress this exact PV1 review.
      { learnerId: "L1", activityId: "a-review", programSlug: "kaelyn-adaptive", programVersionId: "PV0", generated: false, day: "2026-07-13" },
      // Same id in another program cannot suppress this program's review.
      { learnerId: "L1", activityId: "a-reading", programSlug: "another-program", programVersionId: "PV1", generated: false, day: "2026-07-13" },
      // Generated attempts never suppress an authored review.
      { learnerId: "L1", activityId: "a-reading", programSlug: "kaelyn-adaptive", programVersionId: "PV1", generated: true, day: "2026-07-13" },
    ];
  });

  it("filters by due day and exact version, excludes exact authored completions, and orders most overdue first", async () => {
    const reviews = await getDueReviews(
      "acct-1",
      "L1",
      DUE_PROGRAM,
      "PV1",
      "2026-07-13",
    );

    expect(reviews.map((review) => [review.activity.id, review.skill, review.nextReviewOn])).toEqual([
      ["a-review", "math.add", "2026-07-10"],
      ["a-reading", "reading.fluency", "2026-07-12"],
    ]);
  });

  it("surfaces at most one activity per due skill (no flooding)", async () => {
    // math.add maps to two available activities (a-today, a-review); with
    // neither completed, only the FIRST authored match must surface.
    completedTodayRows.value = [];
    reviewScheduleRows.value = [
      { id: "R1", learnerId: "L1", skill: "math.add", programSlug: "kaelyn-adaptive", intervalIndex: 1, nextReviewOn: "2026-07-10", lastReviewedOn: null, lastOutcome: "solid" },
    ];

    const reviews = await getDueReviews(
      "acct-1",
      "L1",
      DUE_PROGRAM,
      "PV1",
      "2026-07-13",
    );

    expect(reviews.filter((review) => review.skill === "math.add")).toHaveLength(1);
    expect(reviews[0].activity.id).toBe("a-today");
  });

  it("never surfaces a checkpoint unit's activity as a review", async () => {
    // A due skill whose only authored match lives in a checkpoint/assessment
    // unit must not appear — completing it would take the checkpoint branch and
    // never advance the schedule.
    completedTodayRows.value = [];
    reviewScheduleRows.value = [
      { id: "R1", learnerId: "L1", skill: "math.add", programSlug: "kaelyn-adaptive", intervalIndex: 1, nextReviewOn: "2026-07-10", lastReviewedOn: null, lastOutcome: "solid" },
    ];
    const checkpointProgram = {
      ...DUE_PROGRAM,
      units: DUE_PROGRAM.units.map((unit) =>
        unit.id === "numbers" ? { ...unit, checkpoint: "baseline" } : unit,
      ),
    } as unknown as Program;

    const reviews = await getDueReviews(
      "acct-1",
      "L1",
      checkpointProgram,
      "PV1",
      "2026-07-13",
    );

    expect(reviews.filter((review) => review.skill === "math.add")).toEqual([]);
  });

  it("returns no rows and does not resolve content for another account's learner", async () => {
    learnerRows.value = [];

    await expect(
      getDueReviews("acct-2", "L1", DUE_PROGRAM, "PV1", "2026-07-13"),
    ).resolves.toEqual([]);
    expect(resolveAccountLearnerProgram).not.toHaveBeenCalled();
    expect(ops.some((op) => op.table === "review_schedule")).toBe(false);
  });

  it("lets reviews remain visible when the captured enrollment has no exact version pin", async () => {
    const reviews = await getDueReviews(
      "acct-1",
      "L1",
      DUE_PROGRAM,
      null,
      "2026-07-13",
    );

    expect(reviews.map((review) => review.activity.id)).toEqual([
      "a-today",
      "a-reading",
    ]);
  });
});

describe("redoCheckpoint (tenancy-checked delete)", () => {
  beforeEach(() => {
    ops.length = 0;
    learnerRows.value = [{ id: "L1" }];
    checkpointResultRows.value = [{ id: "CR1", learnerId: "L1", status: "pending" }];
  });

  it("deletes the checkpoint result row when owned by the account", async () => {
    await redoCheckpoint("acct-1", "CR1");
    expect(ops).toContainEqual({ op: "delete", table: "checkpoint_result" });
  });

  it("does not delete when the learner is not owned by the account", async () => {
    learnerRows.value = []; // simulates a foreign account
    await redoCheckpoint("acct-2", "CR1");
    expect(ops.some((o) => o.op === "delete" && o.table === "checkpoint_result")).toBe(false);
  });

  it("does not delete an already-applied row (the audit record must survive a stray redo)", async () => {
    checkpointResultRows.value = [{ id: "CR1", learnerId: "L1", status: "applied" }];
    await redoCheckpoint("acct-1", "CR1");
    expect(ops.some((o) => o.op === "delete" && o.table === "checkpoint_result")).toBe(false);
  });

  it("no-ops when the checkpoint result does not exist", async () => {
    checkpointResultRows.value = [];
    await redoCheckpoint("acct-1", "CR-missing");
    expect(ops.some((o) => o.op === "delete")).toBe(false);
  });
});
