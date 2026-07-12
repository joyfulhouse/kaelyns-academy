import { describe, expect, it } from "vitest";
import { learnerPickerTransition, resolveAccountLearnerId } from "./learners";

describe("learner picker persistence", () => {
  const learners = ["learner-a", "learner-b"];

  it("auto-enters when the stored learner id is valid", () => {
    expect(resolveAccountLearnerId("learner-b", learners)).toBe("learner-b");
  });

  it("requires a pick when the stored learner id is stale", () => {
    expect(resolveAccountLearnerId("removed-learner", learners)).toBeNull();
  });

  it("requires a pick when no learner id is stored", () => {
    expect(resolveAccountLearnerId(null, learners)).toBeNull();
  });

  it("auto-enters a single-learner account without a stored id", () => {
    expect(resolveAccountLearnerId(null, ["only-learner"])).toBe("only-learner");
  });

  it("opens only for an explicit switch and closes after a pick", () => {
    expect(learnerPickerTransition(false, "switch")).toBe(true);
    expect(learnerPickerTransition(true, "pick")).toBe(false);
  });
});
