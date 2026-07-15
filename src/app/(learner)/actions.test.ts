import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// recordAttemptAction is the trust boundary for progress. The browser sends
// identifiers plus bounded response facts only; the action resolves the exact
// pinned activity (including route unit), validates config/response through the
// server-safe plugin contract, computes the canonical score/evidence, and only
// then calls recordAttempt. There is no live test DB here, so the store and
// pinned-program resolver are mocked while real plugin scoring stays exercised.

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  requireAccount: vi.fn(),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "acc-1", userId: "acc-1" }),
  ),
}));

vi.mock("@/lib/tutor/store", () => ({
  CompletionReplayMismatchError: class CompletionReplayMismatchError extends Error {},
  EnrollmentNotActiveError: class EnrollmentNotActiveError extends Error {},
  recordAttempt: vi.fn(),
  recordOralReadingAttempt: vi.fn(),
  listLearners: vi.fn(),
  // The generated-shelf star witness (B3): recordAttemptAction reads this for a
  // generated attempt to decide shelfEligible + the shelf unit.
  getGeneratedActivity: vi.fn(),
  getPlayableGeneratedActivity: vi.fn(),
  // ensureLessonPractice gate + shelf reads/writes (all account-scoped store fns).
  getLearner: vi.fn(),
  getLearnerSettings: vi.fn(),
  getEnrollmentForGate: vi.fn(),
  getEnrollmentConfig: vi.fn(),
  getSkillState: vi.fn(),
  getCompletedActivityIds: vi.fn(),
  getDueReviews: vi.fn(),
  getGeneratedCompletions: vi.fn(),
  listGeneratedShelf: vi.fn(),
  // Fix 2: ensureLessonPractice serializes recount→generate→insert behind this
  // advisory-lock helper; its DB-level ordering test lives in shelf-lock.test.ts.
  withLessonGenerationLock: vi.fn(),
}));

vi.mock("@/lib/content/repository", () => ({
  resolveAccountLearnerProgram: vi.fn(),
}));

// The heavy AI + shelf modules are mocked so the action tests stay pure: we
// assert the action's derivation (gates, witness, bounds, provenance) — not the
// generator's or the picker's internals (those have their own unit tests).
// Only the heavy generator call is stubbed; the REAL provenanceForGeneration is
// kept (partial mock) so the shelf-stamp assertions exercise its actual, lang-
// aware model routing rather than a re-implemented stand-in.
vi.mock("@/lib/ai/practice", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/ai/practice")>()),
  generatePracticeItems: vi.fn(),
}));

vi.mock("@/lib/tutor/shelf", () => ({
  pickGenerationTargets: vi.fn(),
  shelfCompletions: vi.fn(() => []),
  SHELF_BATCH: 4,
  SHELF_LESSON_CAP: 8,
}));

import {
  CompletionReplayMismatchError,
  EnrollmentNotActiveError,
  recordAttempt,
  recordOralReadingAttempt,
  listLearners,
  getGeneratedActivity,
  getPlayableGeneratedActivity,
  getLearner,
  getLearnerSettings,
  getEnrollmentForGate,
  getEnrollmentConfig,
  getSkillState,
  getCompletedActivityIds,
  getDueReviews,
  getGeneratedCompletions,
  listGeneratedShelf,
  withLessonGenerationLock,
  type ShelfItem,
  type NewGeneratedActivity,
} from "@/lib/tutor/store";
import { requireAccount, UnauthenticatedError } from "@/lib/tenancy";
import { resolveAccountLearnerProgram } from "@/lib/content/repository";
import { generatePracticeItems } from "@/lib/ai/practice";
import { pickGenerationTargets, type GenerationTarget } from "@/lib/tutor/shelf";
import {
  recordAttemptAction,
  getGeneratedPracticeAction,
  ensureLessonPractice,
  getLearnerStateAction,
  getTutorSession,
  type RecordAttemptInput,
} from "./actions";
import type { Program } from "@/content";

const PROGRAM = {
  slug: "kaelyn-adaptive",
  title: "T",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [
    {
      id: "unit-1",
      order: 1,
      title: "Time",
      emoji: "🕐",
      world: "sunshine",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [
        {
          id: "lesson-1",
          order: 1,
          title: "Clock",
          activities: [
            {
              id: "act-1",
              kind: "math-clock",
              title: "Set the clock",
              band: "ready",
              skillTags: ["math.time"],
              config: {
                mode: "set",
                instruction: "Make six o'clock.",
                targetHour: 6,
                targetMinute: 0,
              },
            },
            {
              id: "oral-1",
              kind: "oral-reading",
              title: "Read there",
              band: "ready",
              skillTags: ["phonics.decode.short-a-cvc"],
              config: {
                presentation: "cold",
                instruction: "Read the word.",
                target: "there",
                skillTag: "phonics.decode.short-a-cvc",
              },
            },
          ],
        },
      ],
    },
    {
      id: "unit-2",
      order: 2,
      title: "Other",
      emoji: "🌱",
      world: "garden",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [],
    },
  ],
} satisfies Program;

describe("getGeneratedPracticeAction", () => {
  beforeEach(() => {
    vi.mocked(getPlayableGeneratedActivity).mockReset();
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
  });

  it("resolves a shelf row through the selected learner-scoped store boundary", async () => {
    const row = {
      id: "gen-1",
      learnerId: "L1",
      lessonId: "lesson-1",
      unitKey: "unit-1",
      programSlug: "kaelyn-adaptive",
      kind: "math-tenframe" as const,
      title: "Made for you",
      config: { target: 5 },
      skillTags: ["math.add"],
      gen: { model: "ha-assist", route: "ready", at: "2026-07-15T12:00:00.000Z" },
    };
    vi.mocked(getPlayableGeneratedActivity).mockResolvedValue(row);

    await expect(
      getGeneratedPracticeAction({
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        generatedId: "gen-1",
      }),
    ).resolves.toEqual(row);
    expect(getPlayableGeneratedActivity).toHaveBeenCalledWith(
      "acc-1",
      "L1",
      "kaelyn-adaptive",
      "gen-1",
    );
  });

  it("rejects malformed lookup identifiers before reading the store", async () => {
    await expect(
      getGeneratedPracticeAction({
        learnerId: "",
        programSlug: "kaelyn-adaptive",
        generatedId: "gen-1",
      }),
    ).resolves.toBeNull();
    expect(getPlayableGeneratedActivity).not.toHaveBeenCalled();
  });

  it("fails closed before reading a shelf row when the enrollment pin read fails", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockRejectedValue(new Error("pin read failed"));
    vi.mocked(getPlayableGeneratedActivity).mockResolvedValue({} as never);

    await expect(
      getGeneratedPracticeAction({
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        generatedId: "gen-1",
      }),
    ).resolves.toBeNull();
    expect(getPlayableGeneratedActivity).not.toHaveBeenCalled();
  });

  it("rejects a shelf row whose unit-local lesson is absent from the pinned tree", async () => {
    vi.mocked(getPlayableGeneratedActivity).mockResolvedValue({
      id: "gen-1",
      learnerId: "L1",
      lessonId: "lesson-1",
      unitKey: "unit-2",
      programSlug: "kaelyn-adaptive",
      kind: "math-clock",
      title: "Stale generated item",
      config: { mode: "set", instruction: "Make six o'clock.", targetHour: 6, targetMinute: 0 },
      skillTags: ["math.time"],
      gen: { model: "ds4-fast", route: "shelf", at: "2026-07-01T00:00:00.000Z" },
    });

    await expect(
      getGeneratedPracticeAction({
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        generatedId: "gen-1",
      }),
    ).resolves.toBeNull();
  });
});

const BASE_INPUT: RecordAttemptInput = {
  learnerId: "L1",
  programSlug: "kaelyn-adaptive",
  completionId: "11111111-1111-4111-8111-111111111111",
  unitKey: "unit-1",
  activityId: "act-1",
  response: { attempts: 1, totalMinutes: 360 },
};

describe("getTutorSession", () => {
  it("distinguishes an unauthenticated visitor from an operational failure", async () => {
    vi.mocked(requireAccount).mockRejectedValueOnce(new UnauthenticatedError());
    await expect(getTutorSession()).resolves.toEqual({
      status: "unauthenticated",
      learners: [],
    });

    vi.mocked(requireAccount).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getTutorSession()).resolves.toEqual({ status: "error", learners: [] });
    expect(listLearners).not.toHaveBeenCalled();
  });
});

describe("getLearnerStateAction learner defaults", () => {
  it("propagates readAloud/oralReading and keeps the learner AI kill switch authoritative", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "active",
      config: { band: "ready", aiPractice: true },
    });
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(getSkillState).mockResolvedValue({});
    vi.mocked(getCompletedActivityIds).mockResolvedValue([]);
    vi.mocked(getDueReviews).mockResolvedValue([]);
    vi.mocked(getEnrollmentConfig).mockResolvedValue({ band: "ready", aiPractice: true });
    vi.mocked(getLearnerSettings).mockResolvedValue({
      readAloud: false,
      oralReading: true,
      aiPractice: false,
    });
    vi.mocked(listGeneratedShelf).mockResolvedValue([]);
    vi.mocked(getGeneratedCompletions).mockResolvedValue([]);

    const result = await getLearnerStateAction("L1", "kaelyn-adaptive");

    expect(result.config).toEqual({
      band: "ready",
      aiPractice: false,
      readAloud: false,
      oralReading: true,
    });
  });
});

beforeEach(() => {
  vi.mocked(recordAttempt).mockResolvedValue({
    correct: 1,
    total: 1,
    stars: 3,
    skillEvidence: [{ skill: "math.time", outcome: "solid" }],
  });
});
afterEach(() => vi.resetAllMocks());

describe("recordAttemptAction canonical authored scoring", () => {
  it("requires a UUID completion id before resolving content", async () => {
    const result = await recordAttemptAction({
      ...BASE_INPUT,
      completionId: "not-a-uuid",
    });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(resolveAccountLearnerProgram).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("rejects an activity that is not inside the claimed route unit", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);

    const result = await recordAttemptAction({ ...BASE_INPUT, unitKey: "unit-2" });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("rejects malformed response facts before persistence", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);

    const result = await recordAttemptAction({ ...BASE_INPUT, response: { attempts: 0 } });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("rejects a schema-valid wrong completion before persistence", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);

    const result = await recordAttemptAction({
      ...BASE_INPUT,
      response: { attempts: 1, totalMinutes: 390 },
    });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("fails closed when the pinned program cannot be resolved", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(undefined);

    const result = await recordAttemptAction(BASE_INPUT);

    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("ignores a forged browser score and persists the canonical plugin score", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    const forged = {
      ...BASE_INPUT,
      score: {
        correct: 999,
        total: 1,
        stars: 3,
        skillEvidence: [{ skill: "admin.superpowers", outcome: "solid" }],
      },
    } as unknown as RecordAttemptInput;

    const result = await recordAttemptAction(forged);

    const score = {
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.time", outcome: "solid" }],
    } as const;
    expect(result).toEqual({ ok: true, score });
    expect(recordAttempt).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        activityId: "act-1",
        completionId: BASE_INPUT.completionId,
        kind: "math-clock",
        generated: false,
        unitId: "unit-1",
        creditEligible: true,
        response: BASE_INPUT.response,
        score,
      }),
    );
  });

  it("returns the original stored score when the store replays a completion", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    const originalScore = {
      correct: 0,
      total: 1,
      stars: 1 as const,
      skillEvidence: [{ skill: "math.time", outcome: "emerging" as const }],
    };
    vi.mocked(recordAttempt).mockResolvedValue(originalScore);

    await expect(recordAttemptAction(BASE_INPUT)).resolves.toEqual({
      ok: true,
      score: originalScore,
    });
  });

  it("maps a completion identity conflict to an invalid result", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(recordAttempt).mockRejectedValue(new CompletionReplayMismatchError());

    await expect(recordAttemptAction(BASE_INPUT)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("maps the store's locked enrollment curation rejection to inactive", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(recordAttempt).mockRejectedValue(
      new EnrollmentNotActiveError("L1", "kaelyn-adaptive"),
    );

    await expect(recordAttemptAction(BASE_INPUT)).resolves.toEqual({
      ok: false,
      reason: "inactive",
    });
  });
});

describe("recordAttemptAction oral-reading witness boundary", () => {
  const ORAL_INPUT: RecordAttemptInput = {
    learnerId: "L1",
    programSlug: "kaelyn-adaptive",
    completionId: "33333333-3333-4333-8333-333333333333",
    unitKey: "unit-1",
    activityId: "oral-1",
    response: {
      attempts: 2,
      results: ["unclear", "matched"],
      status: "verified",
      correctCount: 999,
      wcpm: 300,
    },
  };

  beforeEach(() => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(recordOralReadingAttempt).mockReset();
  });

  it("ignores all browser verified facts and records only the claimed witness", async () => {
    vi.mocked(recordOralReadingAttempt).mockImplementation(async (_accountId, input) => {
      expect(Object.hasOwn(input, "response")).toBe(false);
      const canonical = input.canonicalize({
        mode: "word",
        result: "matched",
        perWord: null,
        correctCount: 1,
        totalWords: 1,
        wcpm: null,
      });
      expect(canonical).toEqual({
        response: { attempts: 1, results: ["matched"], status: "verified" },
        score: {
          correct: 1,
          total: 1,
          stars: 3,
          skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "solid" }],
        },
      });
      return canonical?.score ?? null;
    });

    const result = await recordAttemptAction({
      ...ORAL_INPUT,
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(result).toEqual({
      ok: true,
      score: {
        correct: 1,
        total: 1,
        stars: 3,
        skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "solid" }],
      },
    });
    expect(recordOralReadingAttempt).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        learnerId: "L1",
        unitKey: "unit-1",
        activityId: "oral-1",
      }),
    );
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("canonicalizes an omitted witness to participation with zero evidence", async () => {
    vi.mocked(recordOralReadingAttempt).mockImplementation(async (_accountId, input) => {
      const canonical = input.canonicalize(null);
      expect(canonical).toEqual({
        response: { attempts: 0, results: [], status: "participated-unverified" },
        score: { correct: 0, total: 0, stars: 1, skillEvidence: [] },
      });
      return canonical?.score ?? null;
    });

    await expect(recordAttemptAction(ORAL_INPUT)).resolves.toEqual({
      ok: true,
      score: { correct: 0, total: 0, stars: 1, skillEvidence: [] },
    });
  });

  it("rejects an invalid, mismatched, expired, or reused witness result from the store", async () => {
    vi.mocked(recordOralReadingAttempt).mockResolvedValue(null);
    await expect(
      recordAttemptAction({
        ...ORAL_INPUT,
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a malformed opaque id before resolving pinned content", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockClear();
    await expect(
      recordAttemptAction({ ...ORAL_INPUT, verificationId: "not-a-uuid" }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(resolveAccountLearnerProgram).not.toHaveBeenCalled();
    expect(recordOralReadingAttempt).not.toHaveBeenCalled();
  });

  it("rejects verification ids for ordinary deterministic activities", async () => {
    await expect(
      recordAttemptAction({
        ...BASE_INPUT,
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(recordOralReadingAttempt).not.toHaveBeenCalled();
  });

  it("rejects generated oral-reading even when the shelf row is learner-owned", async () => {
    vi.mocked(getGeneratedActivity).mockResolvedValue({
      id: "gen-oral",
      lessonId: "lesson-1",
      unitKey: "unit-1",
      programSlug: "kaelyn-adaptive",
      kind: "oral-reading",
      title: "Generated oral",
      config: { instruction: "Read.", target: "there", skillTag: "word.sight" },
      skillTags: ["word.sight"],
      gen: { model: "ha-assist", route: "ready", at: "2026-07-15T00:00:00.000Z" },
    });

    await expect(
      recordAttemptAction({
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
        completionId: "44444444-4444-4444-8444-444444444444",
        generatedActivityId: "gen-oral",
        response: { attempts: 1, results: ["matched"], fallbackUsed: false },
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(recordOralReadingAttempt).not.toHaveBeenCalled();
  });
});

// ── Adventure 2.0 B3: the generated-shelf star witness ───────────────────────

describe("recordAttemptAction generated-shelf witness (earn-once boundary)", () => {
  const generatedInput = {
    learnerId: "L1",
    programSlug: "kaelyn-adaptive",
    completionId: "22222222-2222-4222-8222-222222222222",
    generatedActivityId: "gen-1",
    response: { attempts: 1, totalMinutes: 360 },
  } as RecordAttemptInput;

  it("rejects a generated id not owned by the selected learner", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(getGeneratedActivity).mockResolvedValue(null);

    const result = await recordAttemptAction(generatedInput);

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(getGeneratedActivity).toHaveBeenCalledWith("acc-1", "L1", "gen-1");
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("derives kind, score, unit, tags, and provenance from the owned shelf row", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(getGeneratedActivity).mockResolvedValue({
      id: "gen-1",
      lessonId: "lesson-1",
      unitKey: "unit-1",
      programSlug: "kaelyn-adaptive",
      kind: "math-clock",
      title: "Fresh: clocks",
      config: {
        mode: "set",
        instruction: "Make six o'clock.",
        targetHour: 6,
        targetMinute: 0,
      },
      skillTags: ["math.time"],
      gen: { model: "ds4-fast", route: "shelf", at: "2026-07-01T00:00:00.000Z" },
    });

    const result = await recordAttemptAction(generatedInput);

    expect(result).toEqual({
      ok: true,
      score: {
        correct: 1,
        total: 1,
        stars: 3,
        skillEvidence: [{ skill: "math.time", outcome: "solid" }],
      },
    });
    expect(recordAttempt).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        activityId: "gen-1",
        completionId: generatedInput.completionId,
        kind: "math-clock",
        generated: true,
        shelfEligible: true,
        creditEligible: false,
        unitId: "unit-1",
        provenance: {
          model: "ds4-fast",
          route: "shelf",
          at: new Date("2026-07-01T00:00:00.000Z"),
        },
      }),
    );
  });

  it("returns unavailable before reading a generated row when the enrollment pin read fails", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockRejectedValue(new Error("pin read failed"));

    const result = await recordAttemptAction(generatedInput);

    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(getGeneratedActivity).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("rejects a generated row whose unit-local lesson is absent from the pinned tree", async () => {
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(PROGRAM);
    vi.mocked(getGeneratedActivity).mockResolvedValue({
      id: "gen-1",
      lessonId: "lesson-1",
      unitKey: "unit-2",
      programSlug: "kaelyn-adaptive",
      kind: "math-clock",
      title: "Stale generated item",
      config: {
        mode: "set",
        instruction: "Make six o'clock.",
        targetHour: 6,
        targetMinute: 0,
      },
      skillTags: ["math.time"],
      gen: { model: "ds4-fast", route: "shelf", at: "2026-07-01T00:00:00.000Z" },
    });

    const result = await recordAttemptAction(generatedInput);

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(recordAttempt).not.toHaveBeenCalled();
  });
});

// ── ensureLessonPractice (B3 shelf generation) ───────────────────────────────

const UNIT_ID = "u1";
const LESSON_ID = "u1-l1";

/** A resolved program with one unit/lesson carrying `activityIds` (real
 *  findActivity/locateLesson walk this — @/content is NOT mocked here). */
function makeProgram(activityIds: string[]): Program {
  return {
    slug: "kaelyn-adaptive",
    title: "T",
    subtitle: "",
    ageBand: "",
    summary: "",
    units: [
      {
        id: UNIT_ID,
        order: 1,
        title: "Unit",
        emoji: "🌊",
        world: "ocean",
        bigIdea: "",
        phonicsFocus: "",
        mathFocus: "",
        project: "",
        lessons: [
          {
            id: LESSON_ID,
            order: 1,
            title: "Mon",
            activities: activityIds.map((id) => ({
              id,
              title: `Act ${id}`,
              skillTags: [],
              band: "ready",
              kind: "phonics-wordbuild",
              config: {},
            })),
          },
        ],
      },
    ],
  } as unknown as Program;
}

/** A shelf item already persisted for LESSON_ID. */
function shelfItem(id: string): ShelfItem {
  return {
    id,
    lessonId: LESSON_ID,
    unitKey: UNIT_ID,
    kind: "phonics-wordbuild",
    title: `Fresh: Act ${id}`,
    skillTags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

const ONE_TARGET: GenerationTarget[] = [
  { kind: "phonics-wordbuild", focus: "words", skillTags: [], sourceTitle: "Act a1", n: 4 },
];

/** generatePracticeItems returns opaque per-kind configs (stored as `unknown`);
 *  the action never inspects them, so the test uses placeholder items cast to
 *  the generator's element type. */
type GenItem = Awaited<ReturnType<typeof generatePracticeItems>>[number];
function fakeItems(count: number): GenItem[] {
  return Array.from({ length: count }, (_, i) => ({ q: i }) as unknown as GenItem);
}

// The rows the action built inside withLessonGenerationLock's `generate` callback
// on the last call — captured by the mock below so these action tests can still
// assert the exact rows the action produces (provenance, unitKey, short batches)
// without a live tx. Reset per test.
let lastGeneratedRows: NewGeneratedActivity[] | null = null;

describe("ensureLessonPractice (eager, bounded, idempotent shelf)", () => {
  beforeEach(() => {
    // Happy-path defaults: owned learner, resolved 2-activity lesson, AI enabled,
    // both authored activities complete, empty shelf, one generation target.
    vi.mocked(getLearner).mockResolvedValue({
      id: "L1",
      accountId: "acc-1",
      displayName: "Kid",
      avatar: null,
      birthMonth: null,
    });
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(makeProgram(["a1", "a2"]));
    vi.mocked(getLearnerSettings).mockResolvedValue({});
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: {} });
    vi.mocked(getCompletedActivityIds).mockResolvedValue([
      { activityId: "a1", stars: 3 },
      { activityId: "a2", stars: 2 },
    ]);
    vi.mocked(listGeneratedShelf).mockResolvedValue([]);
    vi.mocked(pickGenerationTargets).mockReturnValue(ONE_TARGET);
    vi.mocked(generatePracticeItems).mockResolvedValue(fakeItems(4));
    // Run the action's `generate` callback (the rows it builds) and echo them back
    // as shelf items — so `generate`/generatePracticeItems is the witness that the
    // model was (or wasn't) called, and lastGeneratedRows holds the built rows. The
    // room mirrors the real helper's empty-shelf case (min(SHELF_BATCH, cap)).
    lastGeneratedRows = null;
    vi.mocked(withLessonGenerationLock).mockImplementation(
      async (_accountId, _learnerId, _scope, _more, generate) => {
        lastGeneratedRows = await generate(4);
        return lastGeneratedRows.map((_r, i) => shelfItem(`new${i}`));
      },
    );
  });

  it("generates + persists a bounded batch on a completed lesson (happy path)", async () => {
    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(4);
    expect(generatePracticeItems).toHaveBeenCalledWith(
      "phonics-wordbuild",
      "ready",
      "words",
      4,
      { skillHints: [] },
    );
    // One row per generated item, stamped with server-derived provenance.
    const rows = lastGeneratedRows!;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      unitKey: UNIT_ID,
      lessonId: LESSON_ID,
      title: "Fresh: Act a1",
      genModel: "ds4-fast",
      genRoute: "shelf",
    });
  });

  it("uses the parent's band preference to route the model (stretch → ds4)", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { band: "stretch" } });

    await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(generatePracticeItems).toHaveBeenCalledWith(
      "phonics-wordbuild",
      "stretch",
      expect.any(String),
      expect.any(Number),
      expect.anything(),
    );
    const rows = lastGeneratedRows!;
    expect(rows[0]).toMatchObject({ genModel: "ds4" });
  });

  it("stamps the lang-aware model for a World-Languages target (stretch lang → ds4-fast, not ds4)", async () => {
    // A World-Languages kind routes on MODEL_FOR_LANGUAGE (ds4-fast) regardless
    // of band, so the shelf provenance must record ds4-fast even at stretch band —
    // NOT the band model (ds4). Guards against re-introducing a flat band stamp.
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { band: "stretch" } });
    vi.mocked(pickGenerationTargets).mockReturnValue([
      {
        kind: "lang-symbol-intro",
        focus: "symbols",
        skillTags: ["zhuyin.symbols.initials"],
        sourceTitle: "Act a1",
        n: 4,
      },
    ]);

    await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    const rows = lastGeneratedRows!;
    expect(rows[0]).toMatchObject({ genModel: "ds4-fast" });
  });

  it("refuses a foreign learner (ok:false) and writes nothing", async () => {
    vi.mocked(getLearner).mockResolvedValue(null);

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: false, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(withLessonGenerationLock).not.toHaveBeenCalled();
  });

  it("fails closed when the per-learner settings kill-switch is off", async () => {
    vi.mocked(getLearnerSettings).mockResolvedValue({ aiPractice: false });

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: false, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("fails closed when the enrollment's aiPractice flag is off", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { aiPractice: false } });

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: false, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("fails closed when the enrollment is not active", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "paused", config: {} });

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: false, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("does NOT generate while the lesson's authored activities are incomplete", async () => {
    // a2 is missing from the completed set → witness fails.
    vi.mocked(getCompletedActivityIds).mockResolvedValue([{ activityId: "a1", stars: 3 }]);
    vi.mocked(listGeneratedShelf).mockResolvedValue([shelfItem("existing")]);

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: true, items: [shelfItem("existing")] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(withLessonGenerationLock).not.toHaveBeenCalled();
  });

  it("is idempotent: a filled shelf without `more` returns as-is, no new generation", async () => {
    vi.mocked(listGeneratedShelf).mockResolvedValue([shelfItem("e1"), shelfItem("e2")]);

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result.items).toEqual([shelfItem("e1"), shelfItem("e2")]);
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(withLessonGenerationLock).not.toHaveBeenCalled();
  });

  it("does not let the same unit-local lesson key in another unit satisfy this shelf", async () => {
    vi.mocked(listGeneratedShelf).mockResolvedValue([
      { ...shelfItem("other-unit"), unitKey: "u2" },
    ]);

    const result = await ensureLessonPractice({
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      lessonId: LESSON_ID,
    });

    expect(result.items).toHaveLength(4);
    expect(withLessonGenerationLock).toHaveBeenCalledWith(
      "acc-1",
      "L1",
      { programSlug: "kaelyn-adaptive", unitKey: UNIT_ID, lessonId: LESSON_ID },
      false,
      expect.any(Function),
    );
  });

  it("honors the per-lesson cap: a full shelf never grows, even with `more`", async () => {
    const full = Array.from({ length: 8 }, (_, i) => shelfItem(`e${i}`));
    vi.mocked(listGeneratedShelf).mockResolvedValue(full);

    const result = await ensureLessonPractice({
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      lessonId: LESSON_ID,
      more: true,
    });

    expect(result.items).toEqual(full);
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(withLessonGenerationLock).not.toHaveBeenCalled();
  });

  it("still persists surviving targets when one generation target throws", async () => {
    const targets: GenerationTarget[] = [
      { kind: "phonics-wordbuild", focus: "words", skillTags: [], sourceTitle: "Act a1", n: 2 },
      { kind: "math-array", focus: "arrays", skillTags: [], sourceTitle: "Act a2", n: 2 },
    ];
    vi.mocked(pickGenerationTargets).mockReturnValue(targets);
    vi.mocked(generatePracticeItems)
      .mockRejectedValueOnce(new Error("model 502"))
      .mockResolvedValueOnce(fakeItems(1));

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result.ok).toBe(true);
    // Only the surviving target's single item is persisted (short batch is fine).
    const rows = lastGeneratedRows!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "math-array", title: "Fresh: Act a2" });
  });

  it("locates the lesson by a contained activityId when no lessonId is given", async () => {
    const result = await ensureLessonPractice({
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      activityId: "a2",
    });

    expect(result.ok).toBe(true);
    expect(pickGenerationTargets).toHaveBeenCalled();
    // The located lesson drives unitKey/lessonId on the persisted rows.
    const rows = lastGeneratedRows!;
    expect(rows[0]).toMatchObject({ unitKey: UNIT_ID, lessonId: LESSON_ID });
  });

  it("is a calm no-op for an unlocatable lesson", async () => {
    const result = await ensureLessonPractice({
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      lessonId: "nope",
    });

    expect(result).toEqual({ ok: false, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("rejects malformed input without touching the DB", async () => {
    const result = await ensureLessonPractice({ learnerId: "", programSlug: "kaelyn-adaptive" });

    expect(result).toEqual({ ok: false, items: [] });
    expect(getLearner).not.toHaveBeenCalled();
  });

  it("never grows a shelf for a baseline CHECK-IN unit (C1 placement integrity): no model call, no generation", async () => {
    // The lesson lives in a checkpoint unit. Even fully completed (the happy-path
    // fixtures), ensureLessonPractice must no-op: a check-in's derivatives would
    // carry the probe's real skill tags and, when played, fold into skill_state,
    // silently moving the learner's level off parent-gated evidence (C1). The guard
    // fires BEFORE the shelf read and the generate/insert lock, so nothing is spent
    // or written.
    const program = makeProgram(["a1", "a2"]);
    (program.units[0] as unknown as { checkpoint: string }).checkpoint = "baseline";
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(program);

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: true, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(withLessonGenerationLock).not.toHaveBeenCalled();
    // The guard precedes the shelf read entirely — a check-in never even looks.
    expect(listGeneratedShelf).not.toHaveBeenCalled();
  });
});
