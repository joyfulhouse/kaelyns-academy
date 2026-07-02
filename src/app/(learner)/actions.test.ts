import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// recordAttemptAction's star-economy membership witness (Codex critical, see the
// doc comment above recordAttemptAction in ./actions.ts): for a non-generated
// (authored) attempt, the action resolves the learner's pinned program and
// verifies `activityId` belongs to that tree via findUnitIdOfActivity BEFORE
// calling recordAttempt. A resolved tree with no match is a forgery attempt and
// must be rejected outright (`invalid`) with recordAttempt never called — that
// is the boundary that closes the star-mint exploit. There is no live test DB;
// the store + resolver + witness are mocked and we assert the derivation
// (reject-without-write vs. creditEligible) rather than any store internals.

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "acc-1", userId: "acc-1" }),
  ),
}));

vi.mock("@/lib/tutor/store", () => ({
  recordAttempt: vi.fn(),
}));

vi.mock("@/lib/content/repository", () => ({
  resolveLearnerProgram: vi.fn(),
}));

vi.mock("@/lib/quests/logic", () => ({
  findUnitIdOfActivity: vi.fn(),
}));

import { recordAttempt } from "@/lib/tutor/store";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { findUnitIdOfActivity } from "@/lib/quests/logic";
import { recordAttemptAction, type RecordAttemptInput } from "./actions";
import type { Program } from "@/content";

const PROGRAM = { slug: "kaelyn-adaptive", title: "T", subtitle: "", ageBand: "", summary: "", units: [] } as unknown as Program;

const BASE_INPUT: RecordAttemptInput = {
  learnerId: "L1",
  programSlug: "kaelyn-adaptive",
  activityId: "act-1",
  kind: "quiz",
  generated: false,
  score: { correct: 1, total: 1, stars: 3, skillEvidence: [] },
};

beforeEach(() => {
  vi.mocked(recordAttempt).mockResolvedValue(undefined);
});
afterEach(() => vi.resetAllMocks());

describe("recordAttemptAction membership witness (star-mint exploit boundary)", () => {
  it("rejects a forged authored activityId (invalid) and never calls recordAttempt", async () => {
    vi.mocked(resolveLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(findUnitIdOfActivity).mockReturnValue(null);

    const result = await recordAttemptAction(BASE_INPUT);

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("records a legit authored activityId with creditEligible: true", async () => {
    vi.mocked(resolveLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(findUnitIdOfActivity).mockReturnValue("unit-1");

    const result = await recordAttemptAction(BASE_INPUT);

    expect(result).toEqual({ ok: true });
    expect(recordAttempt).toHaveBeenCalledOnce();
    expect(recordAttempt).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ unitId: "unit-1", creditEligible: true }),
    );
  });

  it("records forgivingly (creditEligible: false, still recorded) when the program is unresolvable", async () => {
    vi.mocked(resolveLearnerProgram).mockResolvedValue(undefined);

    const result = await recordAttemptAction(BASE_INPUT);

    expect(result).toEqual({ ok: true });
    // findUnitIdOfActivity is never reached — there's no tree to check membership against.
    expect(findUnitIdOfActivity).not.toHaveBeenCalled();
    expect(recordAttempt).toHaveBeenCalledOnce();
    expect(recordAttempt).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ unitId: null, creditEligible: false }),
    );
  });
});
