import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/content";

const hookHarness = vi.hoisted(() => ({
  index: 0,
  values: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  effects: [] as (() => void | (() => void))[],
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    hookHarness.effects.push(effect);
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = hookHarness.index++;
    const setter = vi.fn();
    hookHarness.setters[index] = setter;
    return [index < hookHarness.values.length ? hookHarness.values[index] : initial, setter];
  },
  useSyncExternalStore: () => "L1",
}));

vi.mock("@/app/(learner)/actions", () => ({
  ensureHouseholdLearner: vi.fn(),
  getLearnerStateAction: vi.fn(),
  getTutorSession: vi.fn(),
  recordAttemptAction: vi.fn(),
}));

vi.mock("./localStore", () => ({
  getKeySnapshot: vi.fn(),
  subscribeKey: vi.fn(),
  writeKey: vi.fn(),
}));

vi.mock("./useSkillState", () => ({
  useSkillState: () => ({ skillState: {}, ready: true, record: vi.fn() }),
}));

vi.mock("./useProgress", () => ({
  useProgress: () => ({
    ready: true,
    complete: vi.fn(),
    getStars: vi.fn(() => 0),
    isComplete: vi.fn(() => false),
  }),
}));

import {
  getLearnerStateAction,
  getTutorSession,
  recordAttemptAction,
  type RecordResult,
} from "@/app/(learner)/actions";
import { extractOralReadingVerification, useLearnerState } from "./useLearnerState";

const SCORE = {
  correct: 1,
  total: 1,
  stars: 3 as const,
  skillEvidence: [{ skill: "math.time", outcome: "solid" as const }],
};

const ACTIVITY = {
  id: "act-1",
  title: "Set the clock",
  skillTags: ["math.time"],
  band: "ready",
  kind: "math-clock",
  config: { mode: "set", targetHour: 6, targetMinute: 0 },
} as Activity;

const ORAL_ACTIVITY = {
  id: "oral-1",
  title: "Read there",
  skillTags: ["word.sight"],
  band: "ready",
  kind: "oral-reading",
  config: { instruction: "Read.", target: "there", skillTag: "word.sight" },
} as Activity;

describe("oral-reading completion extractor", () => {
  it("moves only oral-reading's opaque witness to the action seam", () => {
    expect(
      extractOralReadingVerification("oral-reading", {
        attempts: 1,
        results: ["matched"],
        fallbackUsed: false,
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toEqual({
      response: { attempts: 1, results: ["matched"], fallbackUsed: false },
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const ordinary = { attempts: 1, verificationId: "not-a-general-plugin-seam" };
    expect(extractOralReadingVerification("math-clock", ordinary)).toEqual({
      response: ordinary,
    });
  });
});

describe("useLearnerState record completion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hookHarness.index = 0;
    hookHarness.setters = [];
    hookHarness.effects = [];
    hookHarness.values = [
      "authenticated",
      [{ id: "L1", displayName: "Kid", avatar: "🦊" }],
      { "math.time": { history: [{ day: "2026-07-14", outcome: "solid" }] } },
      new Set(["act-0"]),
      { "act-0": 2 },
      {},
      [],
      [],
      null,
      true,
      "L1:kaelyn-adaptive",
    ];
  });

  it("returns a successful canonical result without publishing an operational reload failure", async () => {
    const result: RecordResult = { ok: true, score: SCORE };
    vi.mocked(recordAttemptAction).mockResolvedValue(result);
    vi.mocked(getLearnerStateAction).mockResolvedValue({
      status: "error",
      skillState: {},
      completedActivityIds: [],
      starsByActivity: {},
      generatedShelf: [],
      dueReviews: [],
      config: {},
      program: null,
      available: false,
    });
    const state = useLearnerState("guest-1", "kaelyn-adaptive");
    const completionId = "11111111-1111-4111-8111-111111111111";

    await expect(
      state.record(
        ACTIVITY,
        { attempts: 1, totalMinutes: 360 },
        { unitKey: "unit-1" },
        completionId,
      ),
    ).resolves.toEqual(result);
    await Promise.resolve();
    expect(recordAttemptAction).toHaveBeenCalledWith(
      expect.objectContaining({ completionId }),
    );

    // A rejected reconcile never replaces any of the last known-good account
    // state; all account-state setters remain untouched.
    for (const setter of hookHarness.setters.slice(2)) expect(setter).not.toHaveBeenCalled();
  });

  it("sends the oral witness separately and never as trusted response facts", async () => {
    vi.mocked(recordAttemptAction).mockResolvedValue({
      ok: true,
      score: { correct: 1, total: 1, stars: 3, skillEvidence: [] },
    });
    const state = useLearnerState("guest-1", "kaelyn-adaptive");

    await state.record(
      ORAL_ACTIVITY,
      {
        attempts: 1,
        results: ["matched"],
        fallbackUsed: false,
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      { unitKey: "unit-1" },
      "22222222-2222-4222-8222-222222222222",
    );

    expect(recordAttemptAction).toHaveBeenCalledWith({
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      completionId: "22222222-2222-4222-8222-222222222222",
      unitKey: "unit-1",
      activityId: "oral-1",
      response: { attempts: 1, results: ["matched"], fallbackUsed: false },
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("surfaces an initial operational state-read failure through account error mode", async () => {
    vi.mocked(getTutorSession).mockResolvedValue({
      status: "authenticated",
      learners: [
        { id: "L1", displayName: "Kid", avatar: "🦊", birthMonth: null },
      ],
    });
    vi.mocked(getLearnerStateAction).mockResolvedValue({
      status: "error",
      skillState: {},
      completedActivityIds: [],
      starsByActivity: {},
      generatedShelf: [],
      dueReviews: [],
      config: {},
      program: null,
      available: false,
    });

    useLearnerState("guest-1", "kaelyn-adaptive");
    for (const effect of hookHarness.effects) effect();
    await Promise.resolve();
    await Promise.resolve();

    expect(hookHarness.setters[0]).toHaveBeenLastCalledWith("error");
  });
});
