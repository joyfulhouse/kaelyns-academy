import { describe, it, expect } from "vitest";
import { shapeLearnerExport, type ShapeInput } from "./export";

/** Minimal valid input; individual tests override only the fields they care about. */
function baseInput(overrides: Partial<ShapeInput> = {}): ShapeInput {
  return {
    exportedAt: "2026-06-21T00:00:00.000Z",
    learner: {
      id: "learner-1",
      displayName: "Kaelyn",
      birthMonth: "August",
      settings: { dailyGoal: 3, readAloud: true },
    },
    enrollments: [
      {
        programSlug: "summer-k-to-grade1",
        status: "active",
        config: { band: "ready", dailyGoal: 5 },
      },
    ],
    skillState: [
      {
        skill: "rs.a",
        outcome: "solid",
        evidence: [{ day: "2026-06-20", outcome: "solid" }],
      },
    ],
    reviewSchedules: [
      {
        skill: "rs.a",
        programSlug: "summer-k-to-grade1",
        intervalIndex: 1,
        nextReviewOn: "2026-06-24",
        lastReviewedOn: "2026-06-21",
        lastOutcome: "solid",
      },
    ],
    attempts: [
      {
        activityId: "u1l1a1",
        kind: "reading",
        programSlug: "summer-k-to-grade1",
        unitKey: "unit-1",
        programVersionId: "version-7",
        score: { stars: 3, correct: 5, total: 5, skillEvidence: [{ skill: "rs.a", outcome: "solid" }] },
        response: { text: "the cat sat on the mat", picks: [1, 0] },
        day: "2026-06-20",
        createdAt: new Date("2026-06-20T10:00:00.000Z"),
      },
    ],
    stars: {
      balance: 12,
      ledger: [
        {
          delta: 3,
          reason: "activity_complete",
          refId: "u1l1a1",
          createdAt: new Date("2026-06-20T10:00:00.000Z"),
        },
      ],
    },
    stickers: [{ stickerId: "sticker-1", acquiredAt: new Date("2026-06-19T08:00:00.000Z") }],
    interests: [{ slug: "dinosaurs", source: "child" }],
    quests: [{ title: "Finish 3 activities", status: "done", assignedOn: "2026-06-20" }],
    checkpointResults: [
      {
        unitId: "reading-baseline",
        phase: "baseline",
        scores: { "rs.a": 0.8 },
        status: "applied",
        createdAt: "2026-06-15T09:00:00.000Z",
      },
    ],
    generatedActivities: [
      {
        programVersionId: "version-1",
        unitKey: "unit-life-skills-math",
        lessonId: "lesson-counting-coins",
        kind: "math-tenframe",
        title: "Coin Count",
        config: { a: 1 },
        skillTags: ["math.count"],
        genModel: "ha-assist",
        genRoute: "ready",
        genAt: "2026-06-26T08:00:00.000Z",
        createdAt: "2026-06-26T08:00:01.000Z",
      },
    ],
    ...overrides,
  };
}

describe("shapeLearnerExport (pure shaper)", () => {
  it("includes the injected exportedAt timestamp", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.exportedAt).toBe("2026-06-21T00:00:00.000Z");
  });

  it("includes only id, displayName, birthMonth on the learner node — no accountId or other PII", () => {
    const result = shapeLearnerExport(baseInput());
    expect(Object.keys(result.learner)).toEqual(["id", "displayName", "birthMonth"]);
    expect(result.learner.id).toBe("learner-1");
    expect(result.learner.displayName).toBe("Kaelyn");
    expect(result.learner.birthMonth).toBe("August");
  });

  it("handles null birthMonth", () => {
    const result = shapeLearnerExport(
      baseInput({ learner: { ...baseInput().learner, birthMonth: null } }),
    );
    expect(result.learner.birthMonth).toBeNull();
  });

  it("includes learner settings", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.settings).toEqual({ dailyGoal: 3, readAloud: true });
  });

  it("includes enrollments with programSlug, status, config (no extraneous fields)", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.enrollments).toHaveLength(1);
    const e = result.enrollments[0];
    expect(Object.keys(e)).toEqual(["programSlug", "status", "config"]);
    expect(e.programSlug).toBe("summer-k-to-grade1");
    expect(e.status).toBe("active");
    expect(e.config).toEqual({ band: "ready", dailyGoal: 5 });
  });

  it("includes skillState with skill, outcome, evidence (no extraneous fields)", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.skillState).toHaveLength(1);
    const s = result.skillState[0];
    expect(Object.keys(s)).toEqual(["skill", "outcome", "evidence"]);
    expect(s.skill).toBe("rs.a");
    expect(s.outcome).toBe("solid");
    expect(s.evidence).toEqual([{ day: "2026-06-20", outcome: "solid" }]);
  });

  it("includes the learner's spaced-repetition schedules", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result).toMatchObject({
      reviewSchedules: [
        {
          skill: "rs.a",
          programSlug: "summer-k-to-grade1",
          intervalIndex: 1,
          nextReviewOn: "2026-06-24",
          lastReviewedOn: "2026-06-21",
          lastOutcome: "solid",
        },
      ],
    });
  });

  it("includes attempts with durable route identity and a minimized score", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0];
    expect(Object.keys(a)).toEqual([
      "activityId",
      "kind",
      "programSlug",
      "unitKey",
      "programVersionId",
      "score",
      "response",
      "day",
      "createdAt",
    ]);
    expect(a.activityId).toBe("u1l1a1");
    expect(a.kind).toBe("reading");
    expect(a.programSlug).toBe("summer-k-to-grade1");
    expect(a.unitKey).toBe("unit-1");
    expect(a.programVersionId).toBe("version-7");
    expect(a.score).toEqual({ stars: 3, correct: 5, total: 5 });
    expect(a.day).toBe("2026-06-20");
    expect(a.createdAt).toBe("2026-06-20T10:00:00.000Z");
  });

  it("exports null route identity for pre-migration attempts", () => {
    const input = baseInput();
    delete input.attempts[0].programSlug;
    delete input.attempts[0].unitKey;
    delete input.attempts[0].programVersionId;

    expect(shapeLearnerExport(input).attempts[0]).toMatchObject({
      programSlug: null,
      unitKey: null,
      programVersionId: null,
    });
  });

  it("exports non-journal response payloads verbatim", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.attempts[0].response).toEqual({ text: "the cat sat on the mat", picks: [1, 0] });
  });

  it("reduces a legacy journal response to a bounded participation summary", () => {
    const secretDataUrl = "data:image/png;base64,private-child-drawing";
    const result = shapeLearnerExport(
      baseInput({
        attempts: [
          {
            activityId: "journal-legacy",
            kind: "journal-prompt",
            score: {
              stars: 3,
              correct: 1,
              total: 1,
              skillEvidence: [{ skill: "writing.sentence", outcome: "solid" }],
            },
            response: {
              text: "A private sentence",
              transcript: "private spoken words",
              strokes: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
              drawingDataUrl: secretDataUrl,
              didDraw: true,
            },
            day: "2026-06-20",
            createdAt: "2026-06-20T10:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.attempts[0].response).toEqual({
      markCount: 2,
      textLength: 20,
      usedDictation: true,
      mode: "dictate",
      didDraw: true,
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("data:image");
  });

  it("conservatively clamps malformed journal counters and discards extra fields", () => {
    const result = shapeLearnerExport(
      baseInput({
        attempts: [
          {
            activityId: "journal-current",
            kind: "journal-prompt",
            score: { stars: 2, correct: 1, total: 1, skillEvidence: [] },
            response: {
              markCount: 999,
              textLength: 9_999,
              usedDictation: false,
              mode: "type",
              didDraw: false,
              text: "must be discarded",
            },
            day: "2026-06-20",
            createdAt: "2026-06-20T10:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.attempts[0].response).toEqual({
      markCount: 200,
      textLength: 2_000,
      usedDictation: false,
      mode: "type",
      didDraw: true,
    });
    expect(JSON.stringify(result)).not.toContain("must be discarded");
  });

  it("exports response as null when the attempt has none (authored/no-response rows)", () => {
    const input = baseInput();
    delete input.attempts[0].response;
    const result = shapeLearnerExport(input);
    expect(result.attempts[0].response).toBeNull();
  });

  it("strips skillEvidence from score (no raw model outputs in export)", () => {
    const result = shapeLearnerExport(baseInput());
    const score = result.attempts[0].score;
    // Must not have skillEvidence or any other raw evidence field.
    expect(Object.keys(score)).toEqual(["stars", "correct", "total"]);
    expect("skillEvidence" in score).toBe(false);
  });

  it("converts Date createdAt to ISO string", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.attempts[0].createdAt).toBe("2026-06-20T10:00:00.000Z");
  });

  it("accepts string createdAt without mangling it", () => {
    const input = baseInput();
    input.attempts[0].createdAt = "2026-06-20T10:00:00.000Z";
    const result = shapeLearnerExport(input);
    expect(result.attempts[0].createdAt).toBe("2026-06-20T10:00:00.000Z");
  });

  it("handles empty enrollments, skillState, attempts", () => {
    const result = shapeLearnerExport(
      baseInput({ enrollments: [], skillState: [], attempts: [] }),
    );
    expect(result.enrollments).toHaveLength(0);
    expect(result.skillState).toHaveLength(0);
    expect(result.attempts).toHaveLength(0);
  });

  it("carries the injected exportedAt — never calls new Date() itself", () => {
    const t1 = shapeLearnerExport(baseInput({ exportedAt: "2026-01-01T00:00:00.000Z" }));
    const t2 = shapeLearnerExport(baseInput({ exportedAt: "2026-12-31T23:59:59.999Z" }));
    expect(t1.exportedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(t2.exportedAt).toBe("2026-12-31T23:59:59.999Z");
  });
});

// ── aiProvenance (P6 "what the AI made" trail in the export) ──────────────────
describe("shapeLearnerExport — aiProvenance", () => {
  it("is empty when there are no generated attempts (authored only)", () => {
    // The base attempt has no `generated` flag → authored → no provenance.
    const result = shapeLearnerExport(baseInput());
    expect(result.aiProvenance).toEqual([]);
  });

  it("includes one entry per generated attempt with model/route/generatedAt", () => {
    const result = shapeLearnerExport(
      baseInput({
        attempts: [
          {
            activityId: "gen-1",
            kind: "math-tenframe",
            score: { stars: 2, correct: 2, total: 3, skillEvidence: [] },
            day: "2026-06-21",
            createdAt: new Date("2026-06-21T09:00:00.000Z"),
            generated: true,
            genModel: "ha-assist",
            genRoute: "ready",
            genAt: new Date("2026-06-21T08:59:50.000Z"),
          },
        ],
      }),
    );
    expect(result.aiProvenance).toEqual([
      {
        activityId: "gen-1",
        kind: "math-tenframe",
        model: "ha-assist",
        route: "ready",
        generatedAt: "2026-06-21T08:59:50.000Z",
      },
    ]);
  });

  it("excludes authored attempts from provenance even when generated ones exist", () => {
    const result = shapeLearnerExport(
      baseInput({
        attempts: [
          {
            activityId: "authored-1",
            kind: "reading",
            score: { stars: 3, correct: 5, total: 5, skillEvidence: [] },
            day: "2026-06-21",
            createdAt: "2026-06-21T10:00:00.000Z",
            // no generated flag
          },
          {
            activityId: "gen-2",
            kind: "phonics-wordbuild",
            score: { stars: 1, correct: 1, total: 2, skillEvidence: [] },
            day: "2026-06-21",
            createdAt: "2026-06-21T10:05:00.000Z",
            generated: true,
            genModel: "ha-assist",
            genRoute: "stretch",
            genAt: "2026-06-21T10:04:00.000Z",
          },
        ],
      }),
    );
    // Both attempts are exported, but only the generated one yields provenance.
    expect(result.attempts).toHaveLength(2);
    expect(result.aiProvenance).toHaveLength(1);
    expect(result.aiProvenance[0].activityId).toBe("gen-2");
  });

  it("records null model/route/generatedAt for a pre-provenance generated row", () => {
    // Old generated attempts (before migration 0008) have null gen_* columns —
    // the export stays honest ("model not recorded") rather than fabricating.
    const result = shapeLearnerExport(
      baseInput({
        attempts: [
          {
            activityId: "old-gen",
            kind: "sightword-game",
            score: { stars: 0, correct: 0, total: 1, skillEvidence: [] },
            day: "2026-05-01",
            createdAt: "2026-05-01T10:00:00.000Z",
            generated: true,
            genModel: null,
            genRoute: null,
            genAt: null,
          },
        ],
      }),
    );
    expect(result.aiProvenance).toEqual([
      { activityId: "old-gen", kind: "sightword-game", model: null, route: null, generatedAt: null },
    ]);
  });
});

// ── stars/stickers/interests/quests (Task 10: Adventure 2.0 Phase A export
// coverage — spec §3 motivation + choice tables, all learner-scoped) ─────────
describe("shapeLearnerExport — stars", () => {
  it("includes the star balance and ledger (delta/reason/refId/createdAt only)", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.stars.balance).toBe(12);
    expect(result.stars.ledger).toHaveLength(1);
    const entry = result.stars.ledger[0];
    expect(Object.keys(entry)).toEqual(["delta", "reason", "refId", "createdAt"]);
    expect(entry.delta).toBe(3);
    expect(entry.reason).toBe("activity_complete");
    expect(entry.refId).toBe("u1l1a1");
    expect(entry.createdAt).toBe("2026-06-20T10:00:00.000Z");
  });

  it("converts a string ledger createdAt without mangling it", () => {
    const result = shapeLearnerExport(
      baseInput({
        stars: {
          balance: 0,
          ledger: [
            { delta: -2, reason: "sticker_purchase", refId: "sticker-1", createdAt: "2026-06-18T00:00:00.000Z" },
          ],
        },
      }),
    );
    expect(result.stars.ledger[0].createdAt).toBe("2026-06-18T00:00:00.000Z");
  });

  it("handles an empty ledger with a zero balance", () => {
    const result = shapeLearnerExport(baseInput({ stars: { balance: 0, ledger: [] } }));
    expect(result.stars).toEqual({ balance: 0, ledger: [] });
  });
});

describe("shapeLearnerExport — stickers", () => {
  it("includes owned stickers with stickerId + acquiredAt only (ISO string)", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.stickers).toHaveLength(1);
    const s = result.stickers[0];
    expect(Object.keys(s)).toEqual(["stickerId", "acquiredAt"]);
    expect(s.stickerId).toBe("sticker-1");
    expect(s.acquiredAt).toBe("2026-06-19T08:00:00.000Z");
  });

  it("handles an empty sticker collection", () => {
    const result = shapeLearnerExport(baseInput({ stickers: [] }));
    expect(result.stickers).toEqual([]);
  });
});

describe("shapeLearnerExport — interests", () => {
  it("includes interests with slug + source only — never free text", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.interests).toHaveLength(1);
    const i = result.interests[0];
    expect(Object.keys(i)).toEqual(["slug", "source"]);
    expect(i.slug).toBe("dinosaurs");
    expect(i.source).toBe("child");
  });

  it("handles no interests", () => {
    const result = shapeLearnerExport(baseInput({ interests: [] }));
    expect(result.interests).toEqual([]);
  });
});

describe("shapeLearnerExport — quests", () => {
  it("includes quests with title/status/assignedOn only", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.quests).toHaveLength(1);
    const q = result.quests[0];
    expect(Object.keys(q)).toEqual(["title", "status", "assignedOn"]);
    expect(q.title).toBe("Finish 3 activities");
    expect(q.status).toBe("done");
    expect(q.assignedOn).toBe("2026-06-20");
  });

  it("handles no quests", () => {
    const result = shapeLearnerExport(baseInput({ quests: [] }));
    expect(result.quests).toEqual([]);
  });
});

// ── checkpointResults (Adventure 2.0 C1: baseline/mid/final check-in export) ──
describe("shapeLearnerExport — checkpointResults", () => {
  it("includes unitId/phase/scores/status/createdAt only (no enrollmentId or id)", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.checkpointResults).toHaveLength(1);
    const c = result.checkpointResults[0];
    expect(Object.keys(c)).toEqual(["unitId", "phase", "scores", "status", "createdAt"]);
    expect(c.unitId).toBe("reading-baseline");
    expect(c.phase).toBe("baseline");
    expect(c.scores).toEqual({ "rs.a": 0.8 });
    expect(c.status).toBe("applied");
    expect(c.createdAt).toBe("2026-06-15T09:00:00.000Z");
  });

  it("handles no checkpoint results", () => {
    const result = shapeLearnerExport(baseInput({ checkpointResults: [] }));
    expect(result.checkpointResults).toEqual([]);
  });
});

// ── generatedActivities (Adventure 2.0 B3: AI-generated practice export) ──────
describe("shapeLearnerExport — generatedActivities", () => {
  it("includes unitKey/lessonId/kind/title/config/skillTags + full gen provenance (no learnerId or id)", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.generatedActivities).toHaveLength(1);
    const g = result.generatedActivities[0];
    expect(Object.keys(g)).toEqual([
      "programVersionId",
      "unitKey",
      "lessonId",
      "kind",
      "title",
      "config",
      "skillTags",
      "genModel",
      "genRoute",
      "genAt",
      "createdAt",
    ]);
    expect(g.programVersionId).toBe("version-1");
    expect(g.unitKey).toBe("unit-life-skills-math");
    expect(g.lessonId).toBe("lesson-counting-coins");
    expect(g.kind).toBe("math-tenframe");
    expect(g.title).toBe("Coin Count");
    expect(g.config).toEqual({ a: 1 });
    expect(g.skillTags).toEqual(["math.count"]);
    expect(g.genModel).toBe("ha-assist");
    expect(g.genRoute).toBe("ready");
    expect(g.genAt).toBe("2026-06-26T08:00:00.000Z");
    expect(g.createdAt).toBe("2026-06-26T08:00:01.000Z");
  });

  it("handles no generated activities", () => {
    const result = shapeLearnerExport(baseInput({ generatedActivities: [] }));
    expect(result.generatedActivities).toEqual([]);
  });
});
