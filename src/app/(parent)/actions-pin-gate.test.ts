import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const ctx = { accountId: "account-1", userId: "account-1" };
  return {
    ctx,
    requireAccount: vi.fn(async () => ctx),
    getParentPinHash: vi.fn(async () => "stored-pin-hash"),
    buildAccountExport: vi.fn(async () => ({ exportedAt: "2026-07-14T00:00:00.000Z" })),
    deleteLearner: vi.fn(async () => true),
    applyPlacement: vi.fn(async () => undefined),
    captureNonCritical: vi.fn(),
  };
});

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  requireAccount: mocks.requireAccount,
  // This preserves the vulnerable pre-fix behavior for the red phase. Once the
  // actions use withUnlockedAccount, the real gate calls requireAccount above.
  withAccount: vi.fn(async (fn: (ctx: typeof mocks.ctx) => unknown) => fn(mocks.ctx)),
}));

vi.mock("@/lib/parent-pin-store", () => ({
  getParentPinHash: mocks.getParentPinHash,
}));
vi.mock("@/lib/env", () => ({ getEnv: () => "test-secret" }));
vi.mock("@/lib/capture", () => ({ captureNonCritical: mocks.captureNonCritical }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/tutor/store", () => ({
  applyPlacement: mocks.applyPlacement,
  assignProgram: vi.fn(),
  buildAccountExport: mocks.buildAccountExport,
  buildLearnerExport: vi.fn(),
  createLearner: vi.fn(),
  deleteAccount: vi.fn(),
  deleteLearner: mocks.deleteLearner,
  ensureEnrollment: vi.fn(),
  getRecentAttempts: vi.fn(),
  getSkillState: vi.fn(),
  listLearners: vi.fn(),
  redoCheckpoint: vi.fn(),
  saveLearnerSettings: vi.fn(),
  setEnrollmentConfig: vi.fn(),
  setEnrollmentStatus: vi.fn(),
}));
vi.mock("@/content", () => ({ findActivity: vi.fn(), getSkill: vi.fn() }));
vi.mock("@/lib/content/repository", () => ({
  getProgramAsync: vi.fn(),
  listProgramsAsync: vi.fn(),
}));
vi.mock("@/lib/content/store", () => ({ getPublishedVersionId: vi.fn() }));
vi.mock("@/lib/ai/report", () => ({ generateProgressReport: vi.fn() }));
vi.mock("@/lib/interests/store", () => ({ setOfferedInterests: vi.fn() }));
vi.mock("@/lib/rewards/store", () => ({ grantBonusStars: vi.fn() }));
vi.mock("./data", () => ({
  ADAPTIVE_PROGRAM_SLUG: "kaelyn-adaptive",
  kindLabel: vi.fn(() => "Activity"),
}));

const {
  applyPlacementAction,
  deleteLearnerAction,
  exportAccountAction,
} = await import("./actions");

afterEach(() => vi.clearAllMocks());

describe("parent actions require a current PIN unlock", () => {
  it("blocks direct whole-account export with a valid session but no unlock cookie", async () => {
    const result = await exportAccountAction();

    expect(result).toEqual({
      ok: false,
      reason: "locked",
      message: "The grown-up area is locked. Unlock it to continue.",
    });
    expect(mocks.requireAccount).toHaveBeenCalledOnce();
    expect(mocks.buildAccountExport).not.toHaveBeenCalled();
  });

  it("blocks direct profile deletion before touching the store", async () => {
    const result = await deleteLearnerAction("learner-1");

    expect(result).toMatchObject({ ok: false, reason: "locked" });
    expect(mocks.deleteLearner).not.toHaveBeenCalled();
  });

  it("blocks direct checkpoint mutation before touching the store", async () => {
    const result = await applyPlacementAction("learner-1", "checkpoint-1");

    expect(result).toMatchObject({ ok: false, reason: "locked" });
    expect(mocks.applyPlacement).not.toHaveBeenCalled();
  });
});
