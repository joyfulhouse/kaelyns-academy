import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getLearnerStateAction's availability gate (Fix-F A2) is exercised against
// mocked store reads + a stubbed tenancy seam — there is no live test DB. The
// gate is: an account learner may play (and the result carries a playable
// `program`) ONLY when getEnrollmentForGate reports status "active"; any other
// status (removed/paused/none) returns the empty state with available:false and
// NO program. We also assert there is NO lazy auto-enroll-on-open (A1).

// Keep the real UnauthenticatedError; stub withAccount to run fn with a fixed ctx.
vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "acc-1", userId: "acc-1" }),
  ),
}));

// Stub every store read the action touches. ensureEnrollment is stubbed so a
// test can assert it is NEVER called on open (A1: no lazy auto-enroll).
vi.mock("@/lib/tutor/store", () => ({
  ensureEnrollment: vi.fn(),
  getEnrollmentForGate: vi.fn(),
  getSkillState: vi.fn(),
  getCompletedActivityIds: vi.fn(),
  getDueReviews: vi.fn(),
  getEnrollmentConfig: vi.fn(),
  getLearnerSettings: vi.fn(),
  // B3 shelf reads: the durable "fresh practice" list + the generated-attempt
  // best-stars the action folds into completed/stars (durable shelf credit).
  listGeneratedShelf: vi.fn(),
  getGeneratedCompletions: vi.fn(),
}));

// The resolver for the learner's pinned tree.
vi.mock("@/lib/content/repository", () => ({
  resolveAccountLearnerProgram: vi.fn(),
  listProgramsAsync: vi.fn(),
}));

// Program-shape helpers — the action only needs the id/tag sets, so return empty.
vi.mock("@/content", () => ({
  activityIdsForProgram: () => [],
  skillTagsForProgram: () => [],
}));

import type { Program } from "@/content";
import { resolveAccountLearnerProgram } from "@/lib/content/repository";
import {
  ensureEnrollment,
  getCompletedActivityIds,
  getDueReviews,
  getEnrollmentConfig,
  getEnrollmentForGate,
  getGeneratedCompletions,
  getLearnerSettings,
  getSkillState,
  listGeneratedShelf,
} from "@/lib/tutor/store";
import { getLearnerStateAction } from "./actions";

const PROGRAM = { slug: "kaelyn-adaptive", title: "T", subtitle: "", ageBand: "", summary: "", units: [] } as unknown as Program;

beforeEach(() => {
  vi.mocked(getSkillState).mockResolvedValue({});
  vi.mocked(getCompletedActivityIds).mockResolvedValue([]);
  vi.mocked(getDueReviews).mockResolvedValue([]);
  vi.mocked(getEnrollmentConfig).mockResolvedValue({});
  vi.mocked(getLearnerSettings).mockResolvedValue({});
  vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
  vi.mocked(listGeneratedShelf).mockResolvedValue([]);
  vi.mocked(getGeneratedCompletions).mockResolvedValue([]);
  // Default: an active enrollment → playable.
  vi.mocked(getEnrollmentForGate).mockResolvedValue({
    status: "active",
    config: {},
    configValid: true,
  });
});
afterEach(() => vi.resetAllMocks());

describe("getLearnerStateAction (Fix-F A2 availability gate)", () => {
  it("returns available:false (no program) when there is no enrollment", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue(null);
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.status).toBe("ok");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
    // The pinned tree is never resolved when the gate is closed.
    expect(resolveAccountLearnerProgram).not.toHaveBeenCalled();
  });

  it("returns available:false (no program) when the enrollment is removed", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "removed",
      config: {},
      configValid: true,
    });
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });

  it("returns available:false (no program) when the enrollment is paused", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "paused",
      config: {},
      configValid: true,
    });
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });

  it("fails closed when an active enrollment has malformed stored config", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "active",
      config: { aiPractice: false },
      configValid: false,
    });

    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");

    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
    expect(resolveAccountLearnerProgram).not.toHaveBeenCalled();
  });

  it("returns available:true + the pinned program for an ACTIVE enrollment", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "active",
      config: {},
      configValid: true,
    });
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(true);
    expect(res.program).toBe(PROGRAM);
  });

  it("surfaces due authored reviews for an active enrollment", async () => {
    const dueReview = {
      skill: "math.add",
      nextReviewOn: "2026-07-12",
      activity: { id: "a-review" },
      unit: { id: "unit-1" },
      lesson: { id: "lesson-1" },
    };
    vi.mocked(getDueReviews).mockResolvedValue([dueReview] as never);

    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");

    expect(res.dueReviews).toEqual([dueReview]);
    expect(getDueReviews).toHaveBeenCalledWith(
      "acc-1",
      "L1",
      "kaelyn-adaptive",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("does NOT lazily auto-enroll on open (A1: ensureEnrollment never called)", async () => {
    await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(ensureEnrollment).not.toHaveBeenCalled();
  });

  it("returns available:false for an empty learnerId (no store reads)", async () => {
    const res = await getLearnerStateAction("", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
  });

  it("returns available:false when active but the program no longer resolves", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "active",
      config: {},
      configValid: true,
    });
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(undefined);
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });

  it("distinguishes an operational read failure from a legitimate unavailable state", async () => {
    vi.mocked(getEnrollmentForGate).mockRejectedValue(new Error("database unavailable"));

    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");

    expect(res.status).toBe("error");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });

  it("surfaces the generated shelf AND credits a played shelf attempt (durable credit, B3)", async () => {
    const shelfItem = {
      id: "gen-1",
      lessonId: "lsn-1",
      unitKey: "unit-1",
      kind: "math-tenframe" as const,
      title: "Fresh: Count it",
      skillTags: [],
      createdAt: "2026-06-30T00:00:00.000Z",
    };
    vi.mocked(listGeneratedShelf).mockResolvedValue([shelfItem]);
    // A played shelf attempt (generated=true) earned 2 stars; an ephemeral "More"
    // one-shot recorded against an authored id also shows up here but must NOT be
    // credited (it isn't on the shelf).
    vi.mocked(getGeneratedCompletions).mockResolvedValue([
      { activityId: "gen-1", stars: 2 },
      { activityId: "authored-more", stars: 3 },
    ]);

    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");

    expect(res.generatedShelf).toEqual([shelfItem]);
    // The shelf attempt survives the reconcile: its id ∈ completed, stars in the map.
    expect(res.completedActivityIds).toContain("gen-1");
    expect(res.starsByActivity["gen-1"]).toBe(2);
    // The ephemeral "More" one-shot is excluded (not on the shelf).
    expect(res.completedActivityIds).not.toContain("authored-more");
    expect(res.starsByActivity["authored-more"]).toBeUndefined();
  });
});
