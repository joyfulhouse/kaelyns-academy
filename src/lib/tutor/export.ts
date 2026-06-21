/**
 * Pure export-shaping helpers for per-child data export (spec §8).
 * No DB access, no `new Date()` — the caller injects exportedAt so this
 * module stays unit-testable without any mocks.
 */
import type { LearnerSettings, EnrollmentConfig } from "@/lib/content/config";

/** Minimized per-child export (spec §8 child-data posture). */
export interface LearnerExport {
  exportedAt: string;
  learner: {
    id: string;
    displayName: string;
    birthMonth: string | null;
  };
  settings: LearnerSettings;
  enrollments: {
    programSlug: string;
    status: string;
    config: EnrollmentConfig;
  }[];
  skillState: {
    skill: string;
    outcome: string;
    evidence: { day: string; outcome: string }[];
  }[];
  attempts: {
    activityId: string;
    kind: string;
    score: { stars: number; correct: number; total: number };
    day: string;
    createdAt: string;
  }[];
}

export interface ShapeInput {
  exportedAt: string;
  learner: {
    id: string;
    displayName: string;
    birthMonth: string | null;
    settings: LearnerSettings;
  };
  enrollments: {
    programSlug: string;
    status: string;
    config: EnrollmentConfig;
  }[];
  skillState: {
    skill: string;
    outcome: string;
    evidence: { day: string; outcome: string }[];
  }[];
  attempts: {
    activityId: string;
    kind: string;
    score: { stars: number; correct: number; total: number; skillEvidence: unknown[] };
    day: string;
    createdAt: Date | string;
  }[];
}

/**
 * Pure assembly: take the gathered rows and normalize them into the minimized
 * export shape. Includes only the fields declared in LearnerExport — no extra
 * PII, no raw account/user IDs on the learner node.
 */
export function shapeLearnerExport(input: ShapeInput): LearnerExport {
  return {
    exportedAt: input.exportedAt,
    learner: {
      id: input.learner.id,
      displayName: input.learner.displayName,
      birthMonth: input.learner.birthMonth,
    },
    settings: input.learner.settings,
    enrollments: input.enrollments.map((e) => ({
      programSlug: e.programSlug,
      status: e.status,
      config: e.config,
    })),
    skillState: input.skillState.map((s) => ({
      skill: s.skill,
      outcome: s.outcome,
      evidence: s.evidence,
    })),
    attempts: input.attempts.map((a) => ({
      activityId: a.activityId,
      kind: a.kind,
      score: {
        stars: a.score.stars,
        correct: a.score.correct,
        total: a.score.total,
      },
      day: a.day,
      createdAt:
        typeof a.createdAt === "string"
          ? a.createdAt
          : (a.createdAt as Date).toISOString(),
    })),
  };
}
