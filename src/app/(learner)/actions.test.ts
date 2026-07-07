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
  // ensureLessonPractice gate + shelf reads/writes (all account-scoped store fns).
  getLearner: vi.fn(),
  getLearnerSettings: vi.fn(),
  getEnrollmentForGate: vi.fn(),
  getCompletedActivityIds: vi.fn(),
  listGeneratedShelf: vi.fn(),
  insertGeneratedActivities: vi.fn(),
}));

vi.mock("@/lib/content/repository", () => ({
  resolveLearnerProgram: vi.fn(),
}));

vi.mock("@/lib/quests/logic", () => ({
  findUnitIdOfActivity: vi.fn(),
}));

// The heavy AI + shelf modules are mocked so the action tests stay pure: we
// assert the action's derivation (gates, witness, bounds, provenance) — not the
// generator's or the picker's internals (those have their own unit tests).
vi.mock("@/lib/ai/practice", () => ({
  generatePracticeItems: vi.fn(),
  MODEL_FOR_BAND: { ready: "ds4-fast", stretch: "ds4" },
}));

vi.mock("@/lib/tutor/shelf", () => ({
  pickGenerationTargets: vi.fn(),
  SHELF_BATCH: 4,
  SHELF_LESSON_CAP: 8,
}));

import {
  recordAttempt,
  getLearner,
  getLearnerSettings,
  getEnrollmentForGate,
  getCompletedActivityIds,
  listGeneratedShelf,
  insertGeneratedActivities,
  type ShelfItem,
} from "@/lib/tutor/store";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { findUnitIdOfActivity } from "@/lib/quests/logic";
import { generatePracticeItems } from "@/lib/ai/practice";
import { pickGenerationTargets, type GenerationTarget } from "@/lib/tutor/shelf";
import { recordAttemptAction, ensureLessonPractice, type RecordAttemptInput } from "./actions";
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
    vi.mocked(resolveLearnerProgram).mockResolvedValue(makeProgram(["a1", "a2"]));
    vi.mocked(getLearnerSettings).mockResolvedValue({});
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: {} });
    vi.mocked(getCompletedActivityIds).mockResolvedValue([
      { activityId: "a1", stars: 3 },
      { activityId: "a2", stars: 2 },
    ]);
    vi.mocked(listGeneratedShelf).mockResolvedValue([]);
    vi.mocked(pickGenerationTargets).mockReturnValue(ONE_TARGET);
    vi.mocked(generatePracticeItems).mockResolvedValue(fakeItems(4));
    vi.mocked(insertGeneratedActivities).mockImplementation(async (_a, _l, rows) =>
      rows.map((_r, i) => shelfItem(`new${i}`)),
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
    const rows = vi.mocked(insertGeneratedActivities).mock.calls[0][2];
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
    const rows = vi.mocked(insertGeneratedActivities).mock.calls[0][2];
    expect(rows[0]).toMatchObject({ genModel: "ds4" });
  });

  it("refuses a foreign learner (ok:false) and writes nothing", async () => {
    vi.mocked(getLearner).mockResolvedValue(null);

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result).toEqual({ ok: false, items: [] });
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(insertGeneratedActivities).not.toHaveBeenCalled();
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
    expect(insertGeneratedActivities).not.toHaveBeenCalled();
  });

  it("is idempotent: a filled shelf without `more` returns as-is, no new generation", async () => {
    vi.mocked(listGeneratedShelf).mockResolvedValue([shelfItem("e1"), shelfItem("e2")]);

    const result = await ensureLessonPractice({ learnerId: "L1", programSlug: "kaelyn-adaptive", lessonId: LESSON_ID });

    expect(result.items).toEqual([shelfItem("e1"), shelfItem("e2")]);
    expect(generatePracticeItems).not.toHaveBeenCalled();
    expect(insertGeneratedActivities).not.toHaveBeenCalled();
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
    expect(insertGeneratedActivities).not.toHaveBeenCalled();
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
    const rows = vi.mocked(insertGeneratedActivities).mock.calls[0][2];
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
    const rows = vi.mocked(insertGeneratedActivities).mock.calls[0][2];
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
});
