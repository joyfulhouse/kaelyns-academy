import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ensureEnrollment (Fix-E Layer 3) is exercised against a fake `getDb()` whose
// insert chain records the `.values()` payload and the `.onConflictDoNothing()`
// target — there is no live test DB. getPublishedVersionId is mocked so we can
// assert the resolved published version is written as the pin on first insert,
// and that the insert is conflict-guarded (so an existing/removed row is never
// repinned or resurrected).

vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: vi.fn(),
}));

// drizzle operators → opaque; not evaluated by the fake insert chain.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  desc: (a: unknown) => a,
  inArray: (...a: unknown[]) => a,
}));

// The published-version resolver the pin is read from. Mutable per test.
const publishedVersionId = { value: null as string | null };
vi.mock("@/lib/content/store", () => ({
  getPublishedVersionId: vi.fn(async () => publishedVersionId.value),
}));

// Records the last insert's values + conflict target so tests can assert the pin.
const inserted = {
  values: null as Record<string, unknown> | null,
  conflictTarget: null as unknown,
};

function insertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = (v: Record<string, unknown>) => {
    inserted.values = v;
    return chain;
  };
  chain.onConflictDoNothing = (arg: unknown) => {
    inserted.conflictTarget = (arg as { target?: unknown })?.target ?? null;
    return chain;
  };
  // Awaiting the chain resolves (the insert "runs").
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([]).then(resolve);
  return chain;
}

const insert = vi.fn(() => insertChain());
vi.mock("@/lib/db", () => ({ getDb: () => ({ insert }) }));
vi.mock("@/lib/db/schema", () => ({
  learner: { _name: "learner" },
  attempt: { _name: "attempt" },
  enrollment: {
    _name: "enrollment",
    learnerId: { _col: "learnerId" },
    programSlug: { _col: "programSlug" },
  },
  skillState: { _name: "skill_state" },
}));

const { ensureEnrollment } = await import("./store");
const { getPublishedVersionId } = await import("@/lib/content/store");

beforeEach(() => {
  publishedVersionId.value = null;
  inserted.values = null;
  inserted.conflictTarget = null;
  insert.mockClear();
  vi.mocked(getPublishedVersionId).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("ensureEnrollment (pins current published version at creation)", () => {
  it("writes the resolved published version id as programVersionId on insert", async () => {
    publishedVersionId.value = "ver-published-1";

    await ensureEnrollment("L1", "kaelyn-adaptive");

    expect(getPublishedVersionId).toHaveBeenCalledWith("kaelyn-adaptive");
    expect(inserted.values).toMatchObject({
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      programVersionId: "ver-published-1",
    });
  });

  it("guards the insert with onConflictDoNothing on (learnerId, programSlug) — never repins/resurrects", async () => {
    publishedVersionId.value = "ver-published-1";

    await ensureEnrollment("L1", "kaelyn-adaptive");

    // The conflict target is the (learner, program) unique pair, so an existing
    // (or soft-removed) row makes this a no-op rather than an update.
    expect(inserted.conflictTarget).toEqual([{ _col: "learnerId" }, { _col: "programSlug" }]);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("pins null for a static builtin with no DB published version (resolves to static)", async () => {
    publishedVersionId.value = null; // getPublishedVersionId returns null

    await ensureEnrollment("L1", "world-languages");

    expect(inserted.values).toMatchObject({
      learnerId: "L1",
      programSlug: "world-languages",
      programVersionId: null,
    });
  });
});
