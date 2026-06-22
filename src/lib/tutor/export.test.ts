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

  it("includes attempts with activityId, kind, score (stars/correct/total only), day, createdAt", () => {
    const result = shapeLearnerExport(baseInput());
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0];
    expect(Object.keys(a)).toEqual(["activityId", "kind", "score", "day", "createdAt"]);
    expect(a.activityId).toBe("u1l1a1");
    expect(a.kind).toBe("reading");
    expect(a.score).toEqual({ stars: 3, correct: 5, total: 5 });
    expect(a.day).toBe("2026-06-20");
    expect(a.createdAt).toBe("2026-06-20T10:00:00.000Z");
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
