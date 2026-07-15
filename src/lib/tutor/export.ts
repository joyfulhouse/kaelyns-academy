/**
 * Pure export-shaping helpers for per-child data export (spec §8).
 * No DB access, no `new Date()` — the caller injects exportedAt so this
 * module stays unit-testable without any mocks.
 */
import type { LearnerSettings, EnrollmentConfig } from "@/lib/content/config";
import type { LedgerEntry } from "@/lib/rewards/store";

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

interface JournalParticipationSummary {
  markCount: number;
  textLength: number;
  usedDictation: boolean;
  mode: "draw" | "scribe" | "type" | "dictate";
  didDraw: boolean;
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
  /** Sparse spaced-repetition state (Phase 3): skill ids + calendar dates only. */
  reviewSchedules: {
    skill: string;
    programSlug: string;
    intervalIndex: number;
    nextReviewOn: string;
    lastReviewedOn: string | null;
    lastOutcome: string | null;
  }[];
  attempts: {
    activityId: string;
    kind: string;
    programSlug: string | null;
    unitKey: string | null;
    programVersionId: string | null;
    score: { stars: number; correct: number; total: number };
    /** Kind-specific response. Journal entries are always a bounded participation summary. */
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
  /** Star economy (Adventure 2.0 Phase A, spec §3.1): balance plus a bounded
   *  (newest-500) ledger page — the same {@link LedgerEntry} shape the parent
   *  Rewards panel reads. */
  stars: {
    balance: number;
    ledger: LedgerEntry[];
  };
  /** Owned stickers (spec §3.2): which sticker and when it was earned/bought. */
  stickers: { stickerId: string; acquiredAt: string }[];
  /** Offered + picked interests (spec §3.3) — slug + source only. Never the
   *  interest label/free text: the taxonomy is admin-authored and bounded, so
   *  the slug alone is enough to identify it (§8, no free text ever exported). */
  interests: { slug: string; source: string }[];
  /** Daily quests (spec §3.4), bounded to the newest 200 upstream. */
  quests: { title: string; status: string; assignedOn: string }[];
  /** Baseline/mid/final check-in results (Adventure 2.0 C1, spec §3.5) — per-skill
   *  first-try scores + the parent-confirmation status. */
  checkpointResults: {
    unitId: string;
    phase: string;
    scores: Record<string, number>;
    status: string;
    createdAt: string;
  }[];
  /** AI-generated practice items (B3 §4): what the AI made for this child —
   *  kind, title, config, and full generation provenance. */
  generatedActivities: {
    programVersionId: string | null;
    unitKey: string; lessonId: string; kind: string; title: string;
    config: unknown; skillTags: string[];
    genModel: string; genRoute: string; genAt: string; createdAt: string;
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
  reviewSchedules: {
    skill: string;
    programSlug: string;
    intervalIndex: number;
    nextReviewOn: string;
    lastReviewedOn: string | null;
    lastOutcome: string | null;
  }[];
  attempts: {
    activityId: string;
    kind: string;
    /** Null for attempts recorded before durable content identity was introduced. */
    programSlug?: string | null;
    unitKey?: string | null;
    programVersionId?: string | null;
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
  stars: {
    balance: number;
    ledger: {
      delta: number;
      reason: string;
      refId: string | null;
      createdAt: Date | string;
    }[];
  };
  stickers: { stickerId: string; acquiredAt: Date | string }[];
  interests: { slug: string; source: string }[];
  quests: { title: string; status: string; assignedOn: string }[];
  checkpointResults: {
    unitId: string;
    phase: string;
    scores: Record<string, number>;
    status: string;
    createdAt: string;
  }[];
  generatedActivities: {
    programVersionId: string | null;
    unitKey: string; lessonId: string; kind: string; title: string;
    config: unknown; skillTags: string[];
    genModel: string; genRoute: string; genAt: string; createdAt: string;
  }[];
}

/** Normalize a Date|string|null timestamp to an ISO string (or null). */
function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/** Normalize a REQUIRED Date|string timestamp to an ISO string (never null;
 *  every star-ledger/sticker timestamp is `notNull` in the schema). */
function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedInteger(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(value)));
}

function stringLength(value: unknown): number {
  return typeof value === "string" ? Array.from(value).length : 0;
}

function journalMode(
  candidate: unknown,
  summary: Omit<JournalParticipationSummary, "mode">,
): JournalParticipationSummary["mode"] {
  if (candidate === "draw" && summary.didDraw) return candidate;
  if ((candidate === "scribe" || candidate === "type") && summary.textLength > 0) {
    return candidate;
  }
  if (candidate === "dictate" && summary.usedDictation && summary.textLength > 0) {
    return candidate;
  }
  if (summary.usedDictation) return "dictate";
  if (summary.textLength > 0) return "type";
  if (summary.didDraw) return "draw";
  return "type";
}

/**
 * Defense in depth for legacy rows that predate the journal privacy contract.
 * Derive only bounded participation facts, then drop all child-authored content.
 */
function sanitizeAttemptResponse(kind: string, response: unknown): unknown {
  if (kind !== "journal-prompt") return response;

  const record = objectRecord(response);
  const strokeCount = Array.isArray(record.strokes) ? record.strokes.length : 0;
  const drawingIndicator =
    record.didDraw === true ||
    (typeof record.drawingDataUrl === "string" && record.drawingDataUrl.length > 0)
      ? 1
      : 0;
  const markCount = Math.min(
    200,
    Math.max(boundedInteger(record.markCount, 200), strokeCount, drawingIndicator),
  );
  const textLength = Math.min(
    2_000,
    Math.max(
      boundedInteger(record.textLength, 2_000),
      stringLength(record.text),
      stringLength(record.transcript),
    ),
  );
  const usedDictation =
    textLength > 0 &&
    (record.usedDictation === true ||
      record.mode === "dictate" ||
      stringLength(record.transcript) > 0);
  const withoutMode = {
    markCount,
    textLength,
    usedDictation,
    didDraw: markCount > 0,
  };

  return {
    markCount,
    textLength,
    usedDictation,
    mode: journalMode(record.mode, withoutMode),
    didDraw: withoutMode.didDraw,
  } satisfies JournalParticipationSummary;
}

/** Whole-account exports may receive already-shaped learner data; sanitize it again. */
export function sanitizeLearnerExport(input: LearnerExport): LearnerExport {
  return {
    ...input,
    attempts: input.attempts.map((entry) => ({
      ...entry,
      response: sanitizeAttemptResponse(entry.kind, entry.response),
    })),
  };
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
    reviewSchedules: input.reviewSchedules.map((schedule) => ({
      skill: schedule.skill,
      programSlug: schedule.programSlug,
      intervalIndex: schedule.intervalIndex,
      nextReviewOn: schedule.nextReviewOn,
      lastReviewedOn: schedule.lastReviewedOn,
      lastOutcome: schedule.lastOutcome,
    })),
    attempts: input.attempts.map((a) => ({
      activityId: a.activityId,
      kind: a.kind,
      programSlug: a.programSlug ?? null,
      unitKey: a.unitKey ?? null,
      programVersionId: a.programVersionId ?? null,
      score: {
        stars: a.score.stars,
        correct: a.score.correct,
        total: a.score.total,
      },
      response: sanitizeAttemptResponse(a.kind, a.response ?? null),
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
    // Star economy (Task 10 / spec §3.1): balance is a whole-ledger sum (never
    // bounded by the page below); the ledger itself is the newest-500 page.
    stars: {
      balance: input.stars.balance,
      ledger: input.stars.ledger.map((l) => ({
        delta: l.delta,
        reason: l.reason,
        refId: l.refId,
        createdAt: toIso(l.createdAt),
      })),
    },
    stickers: input.stickers.map((s) => ({
      stickerId: s.stickerId,
      acquiredAt: toIso(s.acquiredAt),
    })),
    interests: input.interests.map((i) => ({ slug: i.slug, source: i.source })),
    quests: input.quests.map((q) => ({
      title: q.title,
      status: q.status,
      assignedOn: q.assignedOn,
    })),
    checkpointResults: input.checkpointResults.map((c) => ({
      unitId: c.unitId,
      phase: c.phase,
      scores: c.scores,
      status: c.status,
      createdAt: c.createdAt,
    })),
    generatedActivities: input.generatedActivities.map((g) => ({
      programVersionId: g.programVersionId,
      unitKey: g.unitKey,
      lessonId: g.lessonId,
      kind: g.kind,
      title: g.title,
      config: g.config,
      skillTags: g.skillTags,
      genModel: g.genModel,
      genRoute: g.genRoute,
      genAt: g.genAt,
      createdAt: g.createdAt,
    })),
  };
}
