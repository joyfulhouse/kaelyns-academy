import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Program } from "@/content";

const testState = vi.hoisted(() => ({ dueReviews: [] as unknown[] }));

vi.mock("./useLearnerState", () => ({
  useLearnerState: () => ({
    skillState: {},
    completed: new Set<string>(),
    getStars: () => 0,
    ready: true,
    mode: "account",
    signedIn: true,
    learners: [{ id: "L1", displayName: "Explorer", avatar: "🦊" }],
    selectedLearnerId: "L1",
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

import { StudioHome } from "./StudioHome";

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

describe("StudioHome Warm up row", () => {
  beforeEach(() => {
    testState.dueReviews = [];
  });

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
