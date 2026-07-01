/**
 * Pure export-shaping helpers for per-child data export (spec §8).
 * No DB access, no `new Date()` — the caller injects exportedAt so this
 * module stays unit-testable without any mocks.
 */
import type { LearnerSettings, EnrollmentConfig } from "@/lib/content/config";

/**
 * One "what the AI made" provenance entry in the export (P6 / spec §8), derived
 * from a generated attempt. Metadata only — model/route/when — never a raw
 * prompt (which could embed the child's display name → PII).
 */
interface AiProvenanceEntry {
  activityId: string;
  kind: string;
  /** Logical model route (e.g. "ha-assist"); null for pre-provenance generated rows. */
  model: string | null;
  /** Generation path tag (band or language id); null for pre-provenance rows. */
  route: string | null;
  /** ISO timestamp of generation; null when not recorded (old rows). */
  generatedAt: string | null;
}

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
    /** The child's own response payload (answers, journal text, drawing data). */
    response: unknown;
    day: string;
    createdAt: string;
  }[];
  /**
   * The AI provenance trail (P6): one entry per AI-GENERATED attempt, so an
   * export honestly shows "what the AI made" for this child. Empty when the
   * child has no generated practice.
   */
  aiProvenance: AiProvenanceEntry[];
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
    response?: unknown;
    day: string;
    createdAt: Date | string;
    /** True for AI-generated practice — the only attempts that contribute provenance. */
    generated?: boolean;
    /** Provenance columns (populated only on generated rows). */
    genModel?: string | null;
    genRoute?: string | null;
    genAt?: Date | string | null;
  }[];
}

/** Normalize a Date|string|null timestamp to an ISO string (or null). */
function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value.toISOString();
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
      // The child's own work (journal text, drawings, answers). Exported in full
      // for COPPA "export … all its data" — it is the child's created content.
      response: a.response ?? null,
      day: a.day,
      createdAt:
        typeof a.createdAt === "string"
          ? a.createdAt
          : (a.createdAt as Date).toISOString(),
    })),
    // Provenance trail (P6): one entry per generated attempt, metadata only.
    aiProvenance: input.attempts
      .filter((a) => a.generated)
      .map((a) => ({
        activityId: a.activityId,
        kind: a.kind,
        model: a.genModel ?? null,
        route: a.genRoute ?? null,
        generatedAt: toIsoOrNull(a.genAt),
      })),
  };
}
