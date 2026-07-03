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

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "acc-1", userId: "acc-1" }),
  ),
}));

vi.mock("@/lib/tutor/scope", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tutor/scope")>()),
  withOwnedLearner: vi.fn(
    async (
      _accountId: string,
      _learnerId: string,
      fn: (owned: { id: string; accountId: string; displayName: string; avatar: null; birthMonth: null }) => unknown,
    ) => fn({ id: "L1", accountId: "acc-1", displayName: "Kiddo", avatar: null, birthMonth: null }),
  ),
}));

const { getSkillState, getRecentAttempts, getPendingCheckpointResults } = vi.hoisted(() => ({
  getSkillState: vi.fn(),
  getRecentAttempts: vi.fn(),
  getPendingCheckpointResults: vi.fn(),
}));
vi.mock("@/lib/tutor/store", () => ({ getSkillState, getRecentAttempts, getPendingCheckpointResults }));

vi.mock("@/lib/content/repository", () => ({
  getProgramAsync: vi.fn(async () => undefined),
  findProgramByActivityIdAsync: vi.fn(async () => undefined),
  listProgramSummariesAsync: vi.fn(async () => []),
}));

import { getLearnerDetail } from "./data";

beforeEach(() => {
  getRecentAttempts.mockResolvedValue([]);
  getPendingCheckpointResults.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

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
