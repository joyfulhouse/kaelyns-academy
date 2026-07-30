import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  getLearnerDetail,
  getLearnerCurriculum,
  getLearnerRewards,
  getLearnerFluency,
  getLearnerTypingInsights,
} = vi.hoisted(() => ({
  getLearnerDetail: vi.fn(),
  getLearnerCurriculum: vi.fn(),
  getLearnerRewards: vi.fn(),
  getLearnerFluency: vi.fn(),
  getLearnerTypingInsights: vi.fn(),
}));

vi.mock("@/app/(parent)/data", () => ({
  getLearnerDetail,
  getLearnerCurriculum,
  getLearnerRewards,
  getLearnerFluency,
  getLearnerTypingInsights,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));

vi.mock("@/components/parent/CurriculumPanel", () => ({
  CurriculumPanel: () => <section>Curriculum marker</section>,
}));
vi.mock("@/components/parent/RewardsPanel", () => ({
  RewardsPanel: () => <section>Rewards marker</section>,
}));
vi.mock("@/components/parent/LearnerDataControls", () => ({
  LearnerDataControls: () => <section>Data controls marker</section>,
}));
vi.mock("./CheckpointResultsPanel", () => ({
  CheckpointResultsPanel: () => <section>Check-in results marker</section>,
}));
vi.mock("@/app/(parent)/parent-unlock-challenge", () => ({
  parentUnlockChallenge: vi.fn(async () => null),
}));

import LearnerDetailPage, { metadata } from "./page";

const LEARNER = {
  id: "L1",
  accountId: "acc-1",
  displayName: "Kaelyn",
  avatar: null,
  birthMonth: "June",
};

beforeEach(() => {
  vi.clearAllMocks();
  getLearnerDetail.mockResolvedValue({
    learner: LEARNER,
    program: undefined,
    skills: [],
    recent: [],
    hasActivity: true,
    checkpoints: [],
  });
  getLearnerCurriculum.mockResolvedValue({ enrolled: [], available: [] });
  getLearnerRewards.mockResolvedValue(null);
  getLearnerFluency.mockResolvedValue({
    learner: LEARNER,
    points: [
      { day: "2026-07-10", wcpm: 14, label: "3 days ago" },
      { day: "2026-07-12", wcpm: 21, label: "Yesterday" },
    ],
    latest: 21,
    best: 21,
  });
  getLearnerTypingInsights.mockResolvedValue(null);
});

describe("LearnerDetailPage reading fluency", () => {
  it("fetches fluency and places it between recent attempts and check-in results", async () => {
    const html = renderToStaticMarkup(
      await LearnerDetailPage({ params: Promise.resolve({ id: "L1" }) }),
    );

    expect(getLearnerFluency).toHaveBeenCalledWith("L1");
    expect(html).toContain("Reading fluency");
    expect(html).toContain("21 WCPM");
    expect(html.indexOf("Recent attempts")).toBeLessThan(html.indexOf("Reading fluency"));
    expect(html.indexOf("Reading fluency")).toBeLessThan(
      html.indexOf("Check-in results marker"),
    );
  });

  it("keeps child PII out of page metadata", () => {
    expect(metadata.title).toBe("Learner");
    expect(JSON.stringify(metadata)).not.toContain(LEARNER.displayName);
  });
});

describe("LearnerDetailPage typing insights", () => {
  it("renders nothing when the reader returns null (locked or unowned)", async () => {
    getLearnerTypingInsights.mockResolvedValue(null);

    const html = renderToStaticMarkup(
      await LearnerDetailPage({ params: Promise.resolve({ id: "L1" }) }),
    );

    expect(getLearnerTypingInsights).toHaveBeenCalledWith("L1");
    expect(html).not.toContain("Typing");
  });

  it("renders the section with the components' own empty states when arrays are empty", async () => {
    getLearnerTypingInsights.mockResolvedValue({
      learner: LEARNER,
      misses: [],
      rate: [],
    });

    const html = renderToStaticMarkup(
      await LearnerDetailPage({ params: Promise.resolve({ id: "L1" }) }),
    );

    expect(html).toContain("Typing");
    expect(html).toContain("No Key Camp practice yet");
    expect(html).toContain("No typing speed yet");
    expect(html.indexOf("Reading fluency")).toBeLessThan(html.indexOf("Typing"));
    expect(html.indexOf("Typing")).toBeLessThan(html.indexOf("Check-in results marker"));
  });

  it("does not pass the learner's name into either typing component", async () => {
    getLearnerTypingInsights.mockResolvedValue({
      learner: LEARNER,
      misses: [{ key: "a", misses: 3, attempts: 5 }],
      rate: [{ day: "2026-07-12", wpm: 12, label: "Yesterday" }],
    });

    const html = renderToStaticMarkup(
      await LearnerDetailPage({ params: Promise.resolve({ id: "L1" }) }),
    );

    const typingSectionStart = html.indexOf('id="typing-insights-title"');
    const typingSectionEnd = html.indexOf("</section>", typingSectionStart);
    const typingSectionHtml = html.slice(typingSectionStart, typingSectionEnd);
    expect(typingSectionHtml).not.toContain(LEARNER.displayName);
  });
});
