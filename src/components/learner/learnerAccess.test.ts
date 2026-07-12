import { describe, expect, it } from "vitest";
import {
  accountLearnerSelectionRequired,
  recordingDestination,
  resolveLearnerMode,
} from "./learnerAccess";

describe("learner account access", () => {
  it("keeps a signed-in household with zero learners in account onboarding", () => {
    expect(resolveLearnerMode("authenticated")).toBe("account");
    expect(accountLearnerSelectionRequired("account", null)).toBe(true);
  });

  it("fails closed for every deep-linked learner surface without a selection", () => {
    for (const surface of ["activity", "generated-practice", "unit"] as const) {
      expect(accountLearnerSelectionRequired("account", null), surface).toBe(true);
    }
    expect(recordingDestination("account", null)).toBe("blocked");
  });

  it("preserves local recording for signed-out guests", () => {
    expect(resolveLearnerMode("unauthenticated")).toBe("guest");
    expect(accountLearnerSelectionRequired("guest", "kaelyn")).toBe(false);
    expect(recordingDestination("guest", "kaelyn")).toBe("guest");
  });

  it("keeps session failures out of guest mode and blocks recording", () => {
    expect(resolveLearnerMode("error")).toBe("error");
    expect(accountLearnerSelectionRequired("error", null)).toBe(false);
    expect(recordingDestination("error", null)).toBe("blocked");
  });
});
