import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  function TestPlayer() {
    return null;
  }

  return {
    TestPlayer,
    record: vi.fn(),
    refIndex: 0,
    refValues: [] as { current: unknown }[],
    stateIndex: 0,
    stateValues: [] as unknown[],
    stateSetters: [] as ReturnType<typeof vi.fn>[],
    activity: {
      id: "act-1",
      title: "Set the clock",
      skillTags: ["math.time"],
      band: "ready",
      kind: "math-clock",
      config: { mode: "set", targetHour: 6, targetMinute: 0 },
    },
    unit: {
      id: "unit-1",
      order: 1,
      title: "Time",
      emoji: "🕐",
      world: "sunshine",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [],
    },
    generatedRow: {
      id: "gen-1",
      learnerId: "L1",
      lessonId: "lesson-1",
      unitKey: "unit-1",
      programSlug: "kaelyn-adaptive",
      kind: "math-clock",
      title: "Fresh clocks",
      config: { mode: "set", targetHour: 6, targetMinute: 0 },
      skillTags: ["math.time"],
      gen: { model: "ds4-fast", route: "shelf", at: "2026-07-15T00:00:00.000Z" },
    },
  };
});

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useEffect: () => undefined,
  useRef: (initial: unknown) => {
    const index = fixtures.refIndex++;
    if (index >= fixtures.refValues.length) fixtures.refValues[index] = { current: initial };
    return fixtures.refValues[index];
  },
  useState: (initial: unknown) => {
    const index = fixtures.stateIndex++;
    if (index >= fixtures.stateValues.length) fixtures.stateValues[index] = initial;
    const setter = vi.fn((next: unknown) => {
      fixtures.stateValues[index] =
        typeof next === "function"
          ? (next as (prior: unknown) => unknown)(fixtures.stateValues[index])
          : next;
    });
    fixtures.stateSetters[index] = setter;
    return [fixtures.stateValues[index], setter];
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("motion/react", () => ({
  AnimatePresence: "animate-presence",
  motion: { div: "motion-div", span: "motion-span" },
  useReducedMotion: () => true,
}));
vi.mock("@/activities", () => ({
  getActivityType: () => ({ schema: {}, Player: fixtures.TestPlayer }),
}));
vi.mock("@/app/(learner)/actions", () => ({
  ensureLessonPractice: vi.fn(async () => ({ ok: true, items: [] })),
  getGeneratedPracticeAction: vi.fn(),
}));
vi.mock("@/content", () => ({ getProgram: () => null, getUnit: () => null }));
vi.mock("./learners", () => ({
  useActiveLearner: () => ({ learner: { id: "guest-1", displayName: "Kid", avatar: "🦊" } }),
}));
vi.mock("./useLearnerState", () => ({
  useLearnerState: () => ({
    record: fixtures.record,
    signedIn: true,
    config: {},
    selectedLearnerId: "L1",
    program: null,
    mode: "account",
    available: true,
    ready: true,
    retrySession: vi.fn(),
  }),
}));
vi.mock("./activityResolution", () => ({
  generatedPracticeRequestKey: () => "request-key",
  playerIdentityKey: () => "player-key",
  resolveGeneratedPractice: () => ({ status: "ready", row: fixtures.generatedRow }),
  resolvePlayableActivity: () => ({
    status: "ready",
    activity: fixtures.activity,
    unit: fixtures.unit,
  }),
  safeParsePlayerConfig: (_schema: unknown, config: unknown) => ({ status: "ready", config }),
}));
vi.mock("./learnerAccess", () => ({ accountLearnerSelectionRequired: () => false }));
vi.mock("./speak", () => ({ stopSpeaking: vi.fn() }));
vi.mock("@/lib/content/config", () => ({ shouldAutoRead: () => false }));
vi.mock("@/activities/_shared/useSpeakOnce", () => ({
  ReadAloudDefaultProvider: "read-aloud-provider",
}));
vi.mock("./AppShellKid", () => ({ AppShellKid: "app-shell-kid" }));
vi.mock("./UnitView", () => ({ NotAssigned: "not-assigned" }));
vi.mock("./AccountLearnerPicker", () => ({ AccountLearnerPicker: "account-picker" }));
vi.mock("./AccountSessionError", () => ({ AccountSessionError: "account-error" }));
vi.mock("@/components/boundaries/KidLoadingShell", () => ({ KidLoadingShell: "kid-loading" }));
vi.mock("@/components/art/Mascot", () => ({ Mascot: "mascot" }));
vi.mock("@/components/art/Decorations", () => ({ Sparkle: "sparkle" }));
vi.mock("@/components/ui/Button", () => ({ Button: "button" }));

import { ActivityHost } from "./ActivityHost";
import { GeneratedPracticeHost } from "./GeneratedPracticeHost";

const COMPLETION_ID = "11111111-1111-4111-8111-111111111111";
const RESPONSE = { attempts: 1, setHour: 6, setMinute: 0 };
const SCORE = {
  correct: 1,
  total: 1,
  stars: 3 as const,
  skillEvidence: [{ skill: "math.time", outcome: "solid" as const }],
};

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (predicate(element)) return element;
  return findElement(element.props.children as ReactNode, predicate);
}

function renderActivityHost() {
  fixtures.refIndex = 0;
  fixtures.stateIndex = 0;
  return ActivityHost({
    programSlug: "kaelyn-adaptive",
    unitKey: "unit-1",
    activityKey: "act-1",
    ssrActivity: fixtures.activity as never,
    ssrUnit: fixtures.unit as never,
    world: "sunshine",
  });
}

function renderGeneratedHost() {
  fixtures.refIndex = 0;
  fixtures.stateIndex = 0;
  return GeneratedPracticeHost({ programSlug: "kaelyn-adaptive", generatedId: "gen-1" });
}

async function flushCompletion() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("completion host retry identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.refIndex = 0;
    fixtures.refValues = [];
    fixtures.stateIndex = 0;
    fixtures.stateValues = [];
    fixtures.stateSetters = [];
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(COMPLETION_ID);
  });

  it("ActivityHost retains one response and UUID through save failure and retry", async () => {
    fixtures.record
      .mockResolvedValueOnce({ ok: false, reason: "error" })
      .mockResolvedValueOnce({ ok: true, score: SCORE });
    const first = renderActivityHost();
    const player = findElement(first, (element) => element.type === fixtures.TestPlayer);

    (player?.props.onComplete as (response: unknown) => void)(RESPONSE);
    await flushCompletion();

    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenNthCalledWith(
      1,
      fixtures.activity,
      RESPONSE,
      { unitKey: "unit-1" },
      COMPLETION_ID,
    );
    expect(fixtures.stateValues[0]).toMatchObject({
      kind: "save-failed",
      response: RESPONSE,
      completionId: COMPLETION_ID,
    });

    const failed = renderActivityHost();
    const retry = findElement(failed, (element) => typeof element.props.onRetry === "function");
    (retry?.props.onRetry as () => void)();
    await flushCompletion();

    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenNthCalledWith(
      2,
      fixtures.activity,
      RESPONSE,
      { unitKey: "unit-1" },
      COMPLETION_ID,
    );
    expect(fixtures.stateValues[0]).toMatchObject({ kind: "reward", stars: 3 });
  });

  it("GeneratedPracticeHost retains one response and UUID through save failure and retry", async () => {
    fixtures.record
      .mockResolvedValueOnce({ ok: false, reason: "error" })
      .mockResolvedValueOnce({ ok: true, score: SCORE });
    const first = renderGeneratedHost();
    const player = findElement(first, (element) => element.type === fixtures.TestPlayer);

    (player?.props.onComplete as (response: unknown) => void)(RESPONSE);
    await flushCompletion();

    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "gen-1" }),
      RESPONSE,
      { generatedActivityId: "gen-1" },
      COMPLETION_ID,
    );
    expect(fixtures.stateValues[0]).toMatchObject({
      kind: "save-failed",
      response: RESPONSE,
      completionId: COMPLETION_ID,
    });

    const failed = renderGeneratedHost();
    const retry = findElement(failed, (element) => typeof element.props.onRetry === "function");
    (retry?.props.onRetry as () => void)();
    await flushCompletion();

    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "gen-1" }),
      RESPONSE,
      { generatedActivityId: "gen-1" },
      COMPLETION_ID,
    );
    expect(fixtures.stateValues[0]).toMatchObject({ kind: "reward", stars: 3 });
  });

  it("ActivityHost accepts only the first rapid completion for one player identity", async () => {
    fixtures.record.mockResolvedValue({ ok: true, score: SCORE });
    const first = renderActivityHost();
    const player = findElement(first, (element) => element.type === fixtures.TestPlayer);
    const complete = player?.props.onComplete as (response: unknown) => void;

    complete(RESPONSE);
    complete({ ...RESPONSE, attempts: 2 });
    await flushCompletion();

    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenCalledWith(
      fixtures.activity,
      RESPONSE,
      { unitKey: "unit-1" },
      COMPLETION_ID,
    );
  });

  it("GeneratedPracticeHost accepts only the first rapid completion for one player identity", async () => {
    fixtures.record.mockResolvedValue({ ok: true, score: SCORE });
    const first = renderGeneratedHost();
    const player = findElement(first, (element) => element.type === fixtures.TestPlayer);
    const complete = player?.props.onComplete as (response: unknown) => void;

    complete(RESPONSE);
    complete({ ...RESPONSE, attempts: 2 });
    await flushCompletion();

    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenCalledTimes(1);
    expect(fixtures.record).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gen-1" }),
      RESPONSE,
      { generatedActivityId: "gen-1" },
      COMPLETION_ID,
    );
  });

  it("ActivityHost converts a rejected record call into the retry posture", async () => {
    fixtures.record.mockRejectedValueOnce(new Error("network unavailable"));
    const first = renderActivityHost();
    const player = findElement(first, (element) => element.type === fixtures.TestPlayer);

    (player?.props.onComplete as (response: unknown) => void)(RESPONSE);
    await flushCompletion();

    expect(fixtures.stateValues[0]).toMatchObject({
      kind: "save-failed",
      response: RESPONSE,
      completionId: COMPLETION_ID,
    });
  });

  it("GeneratedPracticeHost converts a rejected record call into the retry posture", async () => {
    fixtures.record.mockRejectedValueOnce(new Error("network unavailable"));
    const first = renderGeneratedHost();
    const player = findElement(first, (element) => element.type === fixtures.TestPlayer);

    (player?.props.onComplete as (response: unknown) => void)(RESPONSE);
    await flushCompletion();

    expect(fixtures.stateValues[0]).toMatchObject({
      kind: "save-failed",
      response: RESPONSE,
      completionId: COMPLETION_ID,
    });
  });
});
