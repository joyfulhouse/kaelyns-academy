import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// §8 AI-gate store reads (getEnrollmentForGate / getLearnerSettings / the
// safeParse in getEnrollmentConfig) are exercised against a hand-rolled fake
// `getDb()` — there is no live test DB. The fake returns canned rows keyed by
// the table each select reads from, so we can drive each ownership/parse branch.
// captureNonCritical is asserted via the mocked Sentry capture.

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: (e: unknown) => captureException(e),
}));

// Canned rows the fake returns for the next select against each table.
const learnerRows = { value: [] as Record<string, unknown>[] };
const enrollmentRows = { value: [] as Record<string, unknown>[] };

function tableName(t: unknown): string {
  return (t as { _name?: string })._name ?? "unknown";
}

/** Thenable query builder: chainable, resolves to the canned rows for its target. */
function builder() {
  let table = "unknown";
  const chain = {
    from(t: unknown) {
      table = tableName(t);
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return chain;
    },
    then<T>(resolve: (rows: unknown[]) => T) {
      const rows =
        table === "learner"
          ? learnerRows.value
          : table === "enrollment"
            ? enrollmentRows.value
            : [];
      return Promise.resolve(rows).then(resolve);
    },
  };
  return chain;
}

vi.mock("@/lib/db", () => ({ getDb: () => ({ select: () => builder() }) }));
vi.mock("@/lib/db/schema", () => ({
  learner: { _name: "learner", id: {}, accountId: {}, settings: {} },
  enrollment: { _name: "enrollment", learnerId: {}, programSlug: {}, status: {}, config: {} },
  attempt: { _name: "attempt" },
  skillState: { _name: "skill_state" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
}));

const { getEnrollmentForGate, getLearnerSettings, getEnrollmentConfig } = await import("./store");

const OWNED = [{ id: "L1", accountId: "acc-1" }];

beforeEach(() => {
  captureException.mockClear();
  learnerRows.value = OWNED;
  enrollmentRows.value = [];
});
afterEach(() => vi.restoreAllMocks());

describe("getEnrollmentForGate", () => {
  it("returns null when the learner is not owned by the account", async () => {
    learnerRows.value = [];
    expect(await getEnrollmentForGate("acc-1", "L1", "prog")).toBeNull();
  });

  it("returns null when no enrollment row exists (fail-closed)", async () => {
    enrollmentRows.value = [];
    expect(await getEnrollmentForGate("acc-1", "L1", "prog")).toBeNull();
  });

  it("returns the parsed status + config for an active enrollment", async () => {
    enrollmentRows.value = [{ status: "active", config: { aiPractice: true, band: "ready" } }];
    const got = await getEnrollmentForGate("acc-1", "L1", "prog");
    expect(got).toEqual({ status: "active", config: { aiPractice: true, band: "ready" } });
  });

  it("preserves a removed status (soft-remove is not resurrected)", async () => {
    enrollmentRows.value = [{ status: "removed", config: { aiPractice: false } }];
    const got = await getEnrollmentForGate("acc-1", "L1", "prog");
    expect(got?.status).toBe("removed");
  });

  it("fails CLOSED on a malformed config (aiPractice:false) and logs", async () => {
    // A hand-edited row storing the STRING "false" must not satisfy === false
    // via the raw value; safeParse fails → config fails CLOSED to
    // { aiPractice: false } (blocks AI for the corrupt row), and is reported.
    enrollmentRows.value = [{ status: "active", config: { aiPractice: "false" } }];
    const got = await getEnrollmentForGate("acc-1", "L1", "prog");
    expect(got).toEqual({ status: "active", config: { aiPractice: false } });
    expect(got?.config.aiPractice).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe("getLearnerSettings", () => {
  it("returns null when the learner is not owned by the account", async () => {
    learnerRows.value = [];
    expect(await getLearnerSettings("acc-1", "L1")).toBeNull();
  });

  it("returns the parsed settings", async () => {
    learnerRows.value = [{ settings: { aiPractice: false, readAloud: true } }];
    expect(await getLearnerSettings("acc-1", "L1")).toEqual({ aiPractice: false, readAloud: true });
  });

  it("fails CLOSED on malformed settings (aiPractice:false) and logs", async () => {
    // A corrupt settings jsonb that was meant to disable AI must not degrade to
    // {} (which would leave aiPractice undefined → not blocked → fail-open).
    learnerRows.value = [{ settings: { aiPractice: "nope" } }];
    expect(await getLearnerSettings("acc-1", "L1")).toEqual({ aiPractice: false });
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("keeps a legitimately empty settings row permissive ({})", async () => {
    // Absence/empty config is default-allow (correct) — only malformed fails closed.
    learnerRows.value = [{ settings: {} }];
    expect(await getLearnerSettings("acc-1", "L1")).toEqual({});
  });
});

describe("getEnrollmentConfig (safeParse on read)", () => {
  it("fails CLOSED on a malformed stored config (aiPractice:false)", async () => {
    enrollmentRows.value = [{ config: { aiPractice: "false" } }];
    const got = await getEnrollmentConfig("acc-1", "L1", "prog");
    expect(got.aiPractice).toBe(false);
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("returns {} (default-allow) when no enrollment row exists", async () => {
    enrollmentRows.value = [];
    expect(await getEnrollmentConfig("acc-1", "L1", "prog")).toEqual({});
  });

  it("keeps a legitimately empty stored config permissive ({})", async () => {
    enrollmentRows.value = [{ config: {} }];
    expect(await getEnrollmentConfig("acc-1", "L1", "prog")).toEqual({});
    expect(captureException).not.toHaveBeenCalled();
  });
});
