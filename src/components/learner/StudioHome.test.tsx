import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Program } from "@/content";

const testState = vi.hoisted(() => ({
  dueReviews: [] as unknown[],
  selectedLearnerId: "L1" as string | null,
}));

vi.mock("./useLearnerState", () => ({
  useLearnerState: () => ({
    skillState: {},
    completed: new Set<string>(),
    getStars: () => 0,
    ready: true,
    mode: "account",
    signedIn: true,
    learners: [{ id: "L1", displayName: "Explorer", avatar: "🦊" }],
    selectedLearnerId: testState.selectedLearnerId,
    selectLearner: vi.fn(),
    retrySession: vi.fn(),
    setupProfile: vi.fn(),
    record: vi.fn(),
    config: {},
    program: null,
    available: true,
    generatedShelf: [],
    dueReviews: testState.dueReviews,
    refreshShelf: vi.fn(),
  }),
}));

vi.mock("./learners", async (importActual) => ({
  ...(await importActual<typeof import("./learners")>()),
  useActiveLearner: () => ({
    learnerId: "kaelyn",
    learner: { id: "kaelyn", name: "Kaelyn", avatar: "🦊" },
    setLearnerId: vi.fn(),
    ready: true,
  }),
}));

vi.mock("./useRewards", () => ({
  useRewards: () => ({ state: null, settled: true, refresh: vi.fn(), purchase: vi.fn() }),
}));

vi.mock("./useQuests", () => ({
  useQuests: () => ({ quests: null, refresh: vi.fn(), activate: vi.fn() }),
}));

vi.mock("./AppShellKid", () => ({
  AppShellKid: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { completeInterstitialHandoff, StudioHome } from "./StudioHome";

const HERO_ACTIVITY = {
  id: "hero-activity",
  title: "Count the stars",
  kind: "math-tenframe",
  band: "ready",
  skillTags: ["math.count"],
  config: {},
};
const REVIEW_ACTIVITY = {
  id: "review-activity",
  title: "Make five again",
  kind: "math-tenframe",
  band: "ready",
  skillTags: ["math.five"],
  config: {},
};
const LESSON = {
  id: "lesson-1",
  order: 1,
  title: "First steps",
  activities: [HERO_ACTIVITY, REVIEW_ACTIVITY],
};
const UNIT = {
  id: "unit-1",
  order: 1,
  title: "Number Garden",
  emoji: "🌻",
  world: "garden",
  bigIdea: "",
  phonicsFocus: "",
  mathFocus: "",
  project: "",
  lessons: [LESSON],
};
const PROGRAM = {
  slug: "kaelyn-adaptive",
  title: "Test Academy",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [UNIT],
} as unknown as Program;

beforeEach(() => {
  testState.dueReviews = [];
  testState.selectedLearnerId = "L1";
});

describe("StudioHome Warm up row", () => {
  it("renders due authored reviews as a small secondary row without replacing the hero", () => {
    testState.dueReviews = [
      {
        skill: "math.five",
        nextReviewOn: "2026-07-12",
        activity: REVIEW_ACTIVITY,
        unit: UNIT,
        lesson: LESSON,
      },
    ];

    const html = renderToStaticMarkup(<StudioHome program={PROGRAM} />);

    expect(html).toContain("Continue today&#x27;s adventure");
    expect(html).toContain("Count the stars");
    expect(html).toContain("Warm up");
    expect(html).toContain("Let&#x27;s warm up with something you know!");
    expect(html).toContain("/learn/kaelyn-adaptive/unit-1/review-activity");
  });

  it("omits the Warm up row when nothing is due", () => {
    const html = renderToStaticMarkup(<StudioHome program={PROGRAM} />);

    expect(html).toContain("Continue today&#x27;s adventure");
    expect(html).not.toContain("Warm up");
  });

  it("does not show the hero's own activity as a Warm up tile (dedup)", () => {
    // A regressed skill can be both the "needs work" hero and due for review —
    // it must not appear twice with contradictory framing.
    testState.dueReviews = [
      { skill: "math.count", nextReviewOn: "2026-07-12", activity: HERO_ACTIVITY, unit: UNIT, lesson: LESSON },
    ];

    const html = renderToStaticMarkup(<StudioHome program={PROGRAM} />);

    expect(html).toContain("Continue today&#x27;s adventure");
    expect(html).not.toContain("Warm up");
  });
});

describe("StudioHome handoff beat", () => {
  it("locks the parent area before revealing the learner map", async () => {
    const events: string[] = [];
    const showRetry = vi.fn();

    await completeInterstitialHandoff({
      lockParentArea: async () => {
        events.push("lock");
        return { ok: true };
      },
      captureFailure: vi.fn(),
      proceed: () => events.push("proceed"),
      showRetry,
    });

    expect(events).toEqual(["lock", "proceed"]);
    expect(showRetry).not.toHaveBeenCalled();
  });

  it("keeps the interstitial retryable when the lock action returns a failure", async () => {
    const captureFailure = vi.fn();
    const proceed = vi.fn();
    const showRetry = vi.fn();

    await completeInterstitialHandoff({
      lockParentArea: async () => ({ ok: false, message: "Lock unavailable" }),
      captureFailure,
      proceed,
      showRetry,
    });

    expect(captureFailure).toHaveBeenCalledWith(
      "handoff interstitial parent lock failed",
      expect.objectContaining({ message: "Lock unavailable" }),
    );
    expect(proceed).not.toHaveBeenCalled();
    expect(showRetry).toHaveBeenCalledWith("One moment — tap GO again");
  });

  it("keeps the interstitial retryable when the lock action throws", async () => {
    const error = new Error("network down");
    const captureFailure = vi.fn();
    const proceed = vi.fn();
    const showRetry = vi.fn();

    await completeInterstitialHandoff({
      lockParentArea: async () => {
        throw error;
      },
      captureFailure,
      proceed,
      showRetry,
    });

    expect(captureFailure).toHaveBeenCalledWith(
      "handoff interstitial parent lock failed",
      error,
    );
    expect(proceed).not.toHaveBeenCalled();
    expect(showRetry).toHaveBeenCalledWith("One moment — tap GO again");
  });

  it("shows a one-tap handoff interstitial before the learner map", () => {
    const html = renderToStaticMarkup(
      <StudioHome
        program={PROGRAM}
        handoff={{ learnerId: "L1", showPinNudge: false }}
      />,
    );

    expect(html).toContain("Passing to Explorer");
    expect(html).toContain(">GO!</button>");
    expect(html).not.toContain("Who is learning today?");
  });

  it("offers the skippable grown-up lock nudge only when requested", () => {
    const html = renderToStaticMarkup(
      <StudioHome
        program={PROGRAM}
        handoff={{ learnerId: "L1", showPinNudge: true }}
      />,
    );

    expect(html).toContain("Lock the grown-up area first?");
    expect(html).toContain("/parent/settings#pin");
  });

  it("uses neutral copy when the handoff id is not in the account learner list", () => {
    const html = renderToStaticMarkup(
      <StudioHome
        program={PROGRAM}
        handoff={{ learnerId: "missing", showPinNudge: false }}
      />,
    );

    expect(html).toContain("Passing the device");
    expect(html).not.toContain("Passing to missing");
  });

  it("keeps GO disabled until the selected learner matches the handoff id", () => {
    testState.selectedLearnerId = "L2";

    const html = renderToStaticMarkup(
      <StudioHome
        program={PROGRAM}
        handoff={{ learnerId: "L1", showPinNudge: false }}
      />,
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*GO!/);
  });
});
