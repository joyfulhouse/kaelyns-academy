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
    attempts: [
      {
        activityId: "u1l1a1",
        kind: "reading",
        score: { stars: 3, correct: 5, total: 5, skillEvidence: [{ skill: "rs.a", outcome: "solid" }] },
        response: { text: "the cat sat on the mat", picks: [1, 0] },
        day: "2026-06-20",
        createdAt: new Date("2026-06-20T10:00:00.000Z"),
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

  it("includes attempts with activityId, kind, score (stars/correct/total only), response, day, createdAt", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0];
    expect(Object.keys(a)).toEqual(["activityId", "kind", "score", "response", "day", "createdAt"]);
    expect(a.activityId).toBe("u1l1a1");
    expect(a.kind).toBe("reading");
    expect(a.score).toEqual({ stars: 3, correct: 5, total: 5 });
    expect(a.day).toBe("2026-06-20");
    expect(a.createdAt).toBe("2026-06-20T10:00:00.000Z");
  });

  it("exports the child's full response payload verbatim (COPPA 'all its data')", () => {
    // The child's own work — journal text, answer picks, drawing data — must be in
    // the export, not silently dropped. Stored verbatim from the attempt row.
    const result = shapeLearnerExport(baseInput());
    expect(result.attempts[0].response).toEqual({ text: "the cat sat on the mat", picks: [1, 0] });
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
