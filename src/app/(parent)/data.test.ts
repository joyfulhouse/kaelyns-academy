import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getLearnerDetail's honest placed-vs-play labeling (Adventure 2.0 C1, Task 5):
 * a skill whose skill_state carries a baseline-sourced solid entry (isPlaced,
 * src/lib/tutor/mastery.ts) reports `source: "baseline"` on its SkillStatus
 * row; a skill that's solid from ordinary day-over-day play, or untouched,
 * reports `source: "play"`. There is no live DB — the tenancy seam, the
 * ownership gate, and the tutor-store/content reads are mocked; only the
 * mapping under test (getLearnerDetail in ./data) is real.
 */

const PLACED_SLUG = "reading.fluency.phrasing";
const OWNED_LEARNER = {
  id: "L1",
  accountId: "acc-1",
  displayName: "Kiddo",
  avatar: null,
  birthMonth: null,
};

const { withUnlockedAccount } = vi.hoisted(() => ({ withUnlockedAccount: vi.fn() }));
vi.mock("@/lib/parent-pin-gate", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/parent-pin-gate")>()),
  withUnlockedAccount,
}));

const { withOwnedLearner } = vi.hoisted(() => ({ withOwnedLearner: vi.fn() }));
vi.mock("@/lib/tutor/scope", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tutor/scope")>()),
  withOwnedLearner,
}));

const {
  getSkillState,
  getRecentAttempts,
  getPendingCheckpointResults,
  getFluencyHistory,
  getTypingMissHistory,
  getTypingRateHistory,
} = vi.hoisted(() => ({
  getSkillState: vi.fn(),
  getRecentAttempts: vi.fn(),
  getPendingCheckpointResults: vi.fn(),
  getFluencyHistory: vi.fn(),
  getTypingMissHistory: vi.fn(),
  getTypingRateHistory: vi.fn(),
}));
vi.mock("@/lib/tutor/store", () => ({
  getSkillState,
  getRecentAttempts,
  getPendingCheckpointResults,
  getFluencyHistory,
  getTypingMissHistory,
  getTypingRateHistory,
}));

vi.mock("@/lib/content/repository", () => ({
  getProgramAsync: vi.fn(async () => undefined),
  findProgramByActivityIdAsync: vi.fn(async () => undefined),
  listProgramSummariesAsync: vi.fn(async () => []),
}));

import { getLearnerDetail, getLearnerFluency, getLearnerTypingInsights } from "./data";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-13T12:00:00"));
  withUnlockedAccount.mockImplementation(
    async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
      fn({ accountId: "acc-1", userId: "acc-1" }),
  );
  withOwnedLearner.mockImplementation(
    async (
      _accountId: string,
      _learnerId: string,
      fn: (owned: typeof OWNED_LEARNER) => unknown,
    ) => fn(OWNED_LEARNER),
  );
  getRecentAttempts.mockResolvedValue([]);
  getPendingCheckpointResults.mockResolvedValue([]);
  getFluencyHistory.mockResolvedValue([]);
  getTypingMissHistory.mockResolvedValue([]);
  getTypingRateHistory.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("getLearnerDetail: SkillStatus.source", () => {
  it('is "baseline" for a skill placed via a parent-confirmed check-in', async () => {
    getSkillState.mockResolvedValue({
      [PLACED_SLUG]: { history: [{ day: "2026-06-20", outcome: "solid", source: "baseline" }] },
    });

    const detail = await getLearnerDetail("L1");
    expect(detail).not.toBeNull();

    const placed = detail!.skills.find((s) => s.slug === PLACED_SLUG);
    expect(placed?.source).toBe("baseline");
    expect(placed?.outcome).toBe("solid"); // placed reads as solid, never as a separate tier

    // Never sticky account-wide — an untouched skill stays "play".
    const untouched = detail!.skills.find((s) => s.slug !== PLACED_SLUG);
    expect(untouched?.source).toBe("play");
    expect(untouched?.outcome).toBeUndefined();
  });

  it('is "play" for a skill made solid through ordinary day-over-day evidence', async () => {
    getSkillState.mockResolvedValue({
      [PLACED_SLUG]: {
        history: [
          { day: "2026-06-18", outcome: "solid" },
          { day: "2026-06-19", outcome: "solid" },
        ],
      },
    });

    const detail = await getLearnerDetail("L1");
    const solidByPlay = detail!.skills.find((s) => s.slug === PLACED_SLUG);
    expect(solidByPlay?.source).toBe("play");
    expect(solidByPlay?.outcome).toBe("solid"); // placed and played-to-solid must be visually distinguishable
  });
});

describe("getLearnerFluency", () => {
  it("keeps the best result per day in chronological order and derives latest and best", async () => {
    getFluencyHistory.mockResolvedValue([
      { day: "2026-07-12", wcpm: 18 },
      { day: "2026-07-10", wcpm: 30 },
      { day: "2026-07-12", wcpm: 23 },
      { day: "2026-07-11", wcpm: 15 },
    ]);

    const series = await getLearnerFluency("L1");

    expect(series).toEqual({
      learner: OWNED_LEARNER,
      points: [
        { day: "2026-07-10", wcpm: 30, label: "3 days ago" },
        { day: "2026-07-11", wcpm: 15, label: "2 days ago" },
        { day: "2026-07-12", wcpm: 23, label: "Yesterday" },
      ],
      latest: 23,
      best: 30,
    });
    expect(getFluencyHistory).toHaveBeenCalledWith("acc-1", "L1");
  });

  it("returns an owned empty series when no sentence reading has a WCPM result", async () => {
    await expect(getLearnerFluency("L1")).resolves.toEqual({
      learner: OWNED_LEARNER,
      points: [],
      latest: null,
      best: null,
    });
  });

  it("drops absent, non-numeric, and non-finite WCPM values defensively", async () => {
    getFluencyHistory.mockResolvedValue([
      { day: "2026-07-08" },
      { day: "2026-07-09", wcpm: "19" },
      { day: "2026-07-10", wcpm: Number.NaN },
      { day: "2026-07-11", wcpm: Number.POSITIVE_INFINITY },
      { day: "2026-07-12", wcpm: 21 },
    ]);

    const series = await getLearnerFluency("L1");

    expect(series?.points).toEqual([
      { day: "2026-07-12", wcpm: 21, label: "Yesterday" },
    ]);
    expect(series?.latest).toBe(21);
    expect(series?.best).toBe(21);
  });

  it("fails closed when the learner is not owned by the account", async () => {
    withOwnedLearner.mockImplementationOnce(
      async (
        _accountId: string,
        _learnerId: string,
        _fn: (owned: typeof OWNED_LEARNER) => unknown,
        fallback: unknown,
      ) => fallback,
    );

    await expect(getLearnerFluency("other-account-learner")).resolves.toBeNull();
    expect(getFluencyHistory).not.toHaveBeenCalled();
  });
});

describe("getLearnerTypingInsights", () => {
  it("passes through misses untouched and labels the rate series via relativeDay", async () => {
    getTypingMissHistory.mockResolvedValue([
      { key: "a", misses: 3, attempts: 5 },
      { key: "b", misses: 2, attempts: 0 }, // misses-only key: no attempts source ever saw it
    ]);
    getTypingRateHistory.mockResolvedValue([
      { day: "2026-07-10", wpm: 12 },
      { day: "2026-07-12", wpm: 18 },
    ]);

    const insights = await getLearnerTypingInsights("L1");

    expect(insights).toEqual({
      learner: OWNED_LEARNER,
      misses: [
        { key: "a", misses: 3, attempts: 5 },
        { key: "b", misses: 2, attempts: 0 },
      ],
      rate: [
        { day: "2026-07-10", wpm: 12, label: "3 days ago" },
        { day: "2026-07-12", wpm: 18, label: "Yesterday" },
      ],
    });
    expect(getTypingMissHistory).toHaveBeenCalledWith("acc-1", "L1");
    expect(getTypingRateHistory).toHaveBeenCalledWith("acc-1", "L1");
  });

  it("returns an owned, non-null result with empty arrays when the learner has no typing attempts", async () => {
    await expect(getLearnerTypingInsights("L1")).resolves.toEqual({
      learner: OWNED_LEARNER,
      misses: [],
      rate: [],
    });
  });

  it("fails closed to null when the learner is not owned by the account", async () => {
    withOwnedLearner.mockImplementationOnce(
      async (
        _accountId: string,
        _learnerId: string,
        _fn: (owned: typeof OWNED_LEARNER) => unknown,
        fallback: unknown,
      ) => fallback,
    );

    await expect(getLearnerTypingInsights("other-account-learner")).resolves.toBeNull();
    expect(getTypingMissHistory).not.toHaveBeenCalled();
    expect(getTypingRateHistory).not.toHaveBeenCalled();
  });

  it("fails closed to null when the account is locked, never partially unlocked", async () => {
    withUnlockedAccount.mockImplementationOnce(
      async (
        _fn: (ctx: { accountId: string; userId: string }) => unknown,
        options?: { lockedFallback: () => unknown },
      ) => options?.lockedFallback(),
    );

    await expect(getLearnerTypingInsights("L1")).resolves.toBeNull();
    expect(withOwnedLearner).not.toHaveBeenCalled();
    expect(getTypingMissHistory).not.toHaveBeenCalled();
    expect(getTypingRateHistory).not.toHaveBeenCalled();
  });
});
