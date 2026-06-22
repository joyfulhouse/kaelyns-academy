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
  getEnrollmentConfig: vi.fn(),
  getLearnerSettings: vi.fn(),
}));

// The resolver for the learner's pinned tree.
vi.mock("@/lib/content/repository", () => ({
  resolveLearnerProgram: vi.fn(),
  listProgramsAsync: vi.fn(),
}));

// Program-shape helpers — the action only needs the id/tag sets, so return empty.
vi.mock("@/content", () => ({
  activityIdsForProgram: () => [],
  skillTagsForProgram: () => [],
}));

import type { Program } from "@/content";
import { resolveLearnerProgram } from "@/lib/content/repository";
import {
  ensureEnrollment,
  getCompletedActivityIds,
  getEnrollmentConfig,
  getEnrollmentForGate,
  getLearnerSettings,
  getSkillState,
} from "@/lib/tutor/store";
import { getLearnerStateAction } from "./actions";

const PROGRAM = { slug: "kaelyn-adaptive", title: "T", subtitle: "", ageBand: "", summary: "", units: [] } as unknown as Program;

beforeEach(() => {
  vi.mocked(getSkillState).mockResolvedValue({});
  vi.mocked(getCompletedActivityIds).mockResolvedValue([]);
  vi.mocked(getEnrollmentConfig).mockResolvedValue({});
  vi.mocked(getLearnerSettings).mockResolvedValue({});
  vi.mocked(resolveLearnerProgram).mockResolvedValue(PROGRAM);
  // Default: an active enrollment → playable.
  vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: {} });
});
afterEach(() => vi.resetAllMocks());

describe("getLearnerStateAction (Fix-F A2 availability gate)", () => {
  it("returns available:false (no program) when there is no enrollment", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue(null);
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
    // The pinned tree is never resolved when the gate is closed.
    expect(resolveLearnerProgram).not.toHaveBeenCalled();
  });

  it("returns available:false (no program) when the enrollment is removed", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "removed", config: {} });
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });

  it("returns available:false (no program) when the enrollment is paused", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "paused", config: {} });
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });

  it("returns available:true + the pinned program for an ACTIVE enrollment", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: {} });
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(true);
    expect(res.program).toBe(PROGRAM);
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
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: {} });
    vi.mocked(resolveLearnerProgram).mockResolvedValue(undefined);
    const res = await getLearnerStateAction("L1", "kaelyn-adaptive");
    expect(res.available).toBe(false);
    expect(res.program).toBeNull();
  });
});
