import { describe, expect, it } from "vitest";
import {
  REVIEW_LADDER_DAYS,
  addDays,
  demote,
  nextReviewOn,
  nextSchedule,
  promote,
  type ReviewScheduleState,
} from "./schedule";

const CURRENT: ReviewScheduleState = {
  intervalIndex: 0,
  nextReviewOn: "2026-07-14",
  lastReviewedOn: null,
  lastOutcome: "solid",
};

describe("review ladder math", () => {
  it("uses the locked 1/3/7/21-day ladder", () => {
    expect(REVIEW_LADDER_DAYS).toEqual([1, 3, 7, 21]);
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(nextReviewOn("2026-07-13", 2)).toBe("2026-07-20");
  });

  it("promotes one rung and clamps at the 21-day rung", () => {
    expect(promote(0)).toBe(1);
    expect(promote(2)).toBe(3);
    expect(promote(3)).toBe(3);
    expect(demote()).toBe(0);
  });
});

describe("nextSchedule", () => {
  it("schedules a newly solid skill at interval 0 for the next day", () => {
    expect(nextSchedule(null, "solid", "2026-07-13")).toEqual({
      intervalIndex: 0,
      nextReviewOn: "2026-07-14",
      lastReviewedOn: null,
      lastOutcome: "solid",
    });
  });

  it("promotes successful reviews up the ladder and clamps at 21 days", () => {
    const rung1 = nextSchedule(CURRENT, "solid", "2026-07-14");
    expect(rung1).toEqual({
      intervalIndex: 1,
      nextReviewOn: "2026-07-17",
      lastReviewedOn: "2026-07-14",
      lastOutcome: "solid",
    });

    expect(
      nextSchedule(
        { ...CURRENT, intervalIndex: 3, nextReviewOn: "2026-07-13" },
        "solid",
        "2026-07-13",
      ),
    ).toEqual({
      intervalIndex: 3,
      nextReviewOn: "2026-08-03",
      lastReviewedOn: "2026-07-13",
      lastOutcome: "solid",
    });
  });

  it.each(["emerging", "not_yet"] as const)(
    "demotes an existing schedule after a %s review",
    (outcome) => {
      expect(
        nextSchedule(
          { ...CURRENT, intervalIndex: 2, nextReviewOn: "2026-07-13" },
          outcome,
          "2026-07-13",
        ),
      ).toEqual({
        intervalIndex: 0,
        nextReviewOn: "2026-07-14",
        lastReviewedOn: "2026-07-13",
        lastOutcome: outcome,
      });
    },
  );

  it("schedules a baseline-placed solid at interval 0", () => {
    expect(nextSchedule(null, "solid", "2026-06-20")).toMatchObject({
      intervalIndex: 0,
      nextReviewOn: "2026-06-21",
    });
  });

  it.each(["emerging", "not_yet"] as const)(
    "keeps a never-solid %s skill unscheduled",
    (outcome) => {
      expect(nextSchedule(null, outcome, "2026-07-13")).toBeNull();
    },
  );
});
