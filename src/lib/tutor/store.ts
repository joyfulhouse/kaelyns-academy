// server-only: this module opens DB connections and must never be imported into
// a Client Component. (the `server-only` package isn't installed; this comment
// is the guard, and only server actions / route handlers import it.)
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attempt, enrollment, learner, skillState } from "@/lib/db/schema";
import type { ActivityScore, SkillOutcome, SkillTag } from "@/content";
import { deriveOutcome, type DayKey, type SkillRecord, type SkillState } from "./mastery";

/**
 * The DB-backed tutor store: the server equivalent of the client's
 * useSkillState. Every read/write is scoped to an account (the Better Auth
 * user), so one parent can only ever touch their own learners' data (spec §7).
 * The mastery engine (deriveOutcome) is applied here so client and server agree
 * on what "solid" means.
 */

export interface LearnerRow {
  id: string;
  accountId: string;
  displayName: string;
  avatar: string | null;
  birthMonth: string | null;
}

/** Bound stored evidence (jsonb can otherwise grow without limit). */
const MAX_HISTORY = 24;

/** Pure: fold one attempt's evidence for a skill into its prior history and
 *  re-derive the outcome. Extracted so the gate logic is unit-testable. */
export function nextSkillRecord(
  prior: { day: string; outcome: string }[] | undefined,
  outcome: SkillOutcome,
  day: DayKey,
): { history: { day: string; outcome: SkillOutcome }[]; outcome: SkillOutcome } {
  const history = [...(prior ?? []), { day, outcome }].slice(-MAX_HISTORY) as {
    day: string;
    outcome: SkillOutcome;
  }[];
  return { history, outcome: deriveOutcome({ history } as SkillRecord) };
}

function toRow(r: typeof learner.$inferSelect): LearnerRow {
  return {
    id: r.id,
    accountId: r.accountId,
    displayName: r.displayName,
    avatar: r.avatar,
    birthMonth: r.birthMonth,
  };
}

export async function listLearners(accountId: string): Promise<LearnerRow[]> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(eq(learner.accountId, accountId))
    .orderBy(learner.createdAt);
  return rows.map(toRow);
}

/** Scoped fetch: returns null if the learner doesn't exist OR isn't this account's. */
export async function getLearner(accountId: string, learnerId: string): Promise<LearnerRow | null> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function createLearner(
  accountId: string,
  input: { displayName: string; birthMonth?: string; avatar?: string },
): Promise<LearnerRow> {
  const rows = await getDb()
    .insert(learner)
    .values({
      accountId,
      displayName: input.displayName,
      birthMonth: input.birthMonth ?? null,
      avatar: input.avatar ?? null,
    })
    .returning();
  return toRow(rows[0]);
}

/** The account's first learner, creating a default one if none exist. */
export async function ensureDefaultLearner(
  accountId: string,
  defaults: { displayName: string; birthMonth?: string },
): Promise<LearnerRow> {
  const existing = await listLearners(accountId);
  if (existing.length > 0) return existing[0];
  return createLearner(accountId, defaults);
}

export async function ensureEnrollment(learnerId: string, programSlug: string): Promise<void> {
  await getDb()
    .insert(enrollment)
    .values({ learnerId, programSlug })
    .onConflictDoNothing({ target: [enrollment.learnerId, enrollment.programSlug] });
}

/** Program slugs a learner is enrolled in (verified to belong to the account). */
export async function listEnrollments(accountId: string, learnerId: string): Promise<string[]> {
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
  const rows = await getDb()
    .select({ programSlug: enrollment.programSlug })
    .from(enrollment)
    .where(eq(enrollment.learnerId, learnerId));
  return rows.map((r) => r.programSlug);
}

export interface RecordAttemptInput {
  learnerId: string;
  activityId: string;
  kind: string;
  generated?: boolean;
  response?: unknown;
  score: ActivityScore;
  /** YYYY-MM-DD; defaults to today (caller's clock). */
  day: DayKey;
}

/**
 * Record one completed activity and fold its skill evidence into skill_state.
 * Verifies the learner belongs to the account first (tenancy boundary).
 */
export async function recordAttempt(accountId: string, input: RecordAttemptInput): Promise<void> {
  // The attempt row and every per-skill fold must commit together: a partial
  // write (attempt saved, skill_state not) loses mastery evidence, and two
  // concurrent submits racing the read-modify-write would otherwise either
  // throw a unique violation after the attempt row is already in, or drop one
  // submit's evidence (last-writer-wins). One transaction + a row lock per
  // (learner,skill) makes the whole thing atomic and serialized.
  await getDb().transaction(async (tx) => {
    // Tenancy boundary, re-checked inside the tx so it shares the snapshot.
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, input.learnerId), eq(learner.accountId, accountId)))
      .limit(1);
    if (!owned[0]) throw new Error("learner not found for account");

    await tx.insert(attempt).values({
      learnerId: input.learnerId,
      activityId: input.activityId,
      kind: input.kind,
      generated: input.generated ?? false,
      score: input.score,
      response: input.response ?? null,
      day: input.day,
    });

    for (const ev of input.score.skillEvidence) {
      // Materialize the row (no-op if it already exists), then lock it FOR
      // UPDATE so concurrent folds for the same (learner,skill) serialize on it
      // rather than racing the read-modify-write.
      await tx
        .insert(skillState)
        .values({ learnerId: input.learnerId, skill: ev.skill, evidence: [], outcome: "not_yet" })
        .onConflictDoNothing({ target: [skillState.learnerId, skillState.skill] });
      const locked = await tx
        .select()
        .from(skillState)
        .where(and(eq(skillState.learnerId, input.learnerId), eq(skillState.skill, ev.skill)))
        .limit(1)
        .for("update");
      const row = locked[0];
      if (!row) continue;
      const { history, outcome } = nextSkillRecord(row.evidence, ev.outcome, input.day);
      await tx
        .update(skillState)
        .set({ evidence: history, outcome, updatedAt: new Date() })
        .where(eq(skillState.id, row.id));
    }
  });
}

/** Read the learner's skill_state in the mastery engine's shape (for next-best,
 *  per-strand levels, and the parent report). */
export async function getSkillState(accountId: string, learnerId: string): Promise<SkillState> {
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return {};
  const rows = await getDb().select().from(skillState).where(eq(skillState.learnerId, learnerId));
  const state: SkillState = {};
  for (const r of rows) {
    state[r.skill as SkillTag] = { history: r.evidence as { day: string; outcome: SkillOutcome }[] };
  }
  return state;
}

export interface RecentAttempt {
  activityId: string;
  kind: string;
  stars: number;
  day: string;
}

export async function getRecentAttempts(
  accountId: string,
  learnerId: string,
  limit = 8,
): Promise<RecentAttempt[]> {
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
  const rows = await getDb()
    .select()
    .from(attempt)
    .where(eq(attempt.learnerId, learnerId))
    .orderBy(desc(attempt.createdAt))
    .limit(limit);
  return rows.map((r) => ({ activityId: r.activityId, kind: r.kind, stars: r.score.stars, day: r.day }));
}

export interface CompletedActivity {
  activityId: string;
  /** Best stars (0..3) the learner earned on this authored activity. */
  stars: number;
}

/** Clamp any stored stars value to the 0..3 range the UI renders. */
function clampStars(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.round(value)));
}

/**
 * Authored activities the learner has completed (generated practice excluded),
 * each with the best stars earned. This is the account-mode equivalent of the
 * client's "completed" set + best-stars map: it feeds the next-best recommender,
 * the world-map progress rings/locks, and the per-activity star glyphs (so they
 * survive a reload, not just an in-session optimistic update).
 *
 * Best-stars is folded in TS (the score lives in a jsonb column and a learner's
 * attempt volume is small) so there's no fragile jsonb-aggregate SQL.
 */
export async function getCompletedActivityIds(
  accountId: string,
  learnerId: string,
): Promise<CompletedActivity[]> {
  const owned = await getLearner(accountId, learnerId);
  if (!owned) return [];
  const rows = await getDb()
    .select({ activityId: attempt.activityId, score: attempt.score })
    .from(attempt)
    .where(and(eq(attempt.learnerId, learnerId), eq(attempt.generated, false)))
    // Bound this otherwise-unbounded select; one learner's authored-attempt
    // volume is far below this, so the best-stars fold stays complete.
    .limit(5000);
  const best = new Map<string, number>();
  for (const r of rows) {
    const stars = clampStars(r.score.stars);
    const prior = best.get(r.activityId) ?? 0;
    if (stars > prior || !best.has(r.activityId)) best.set(r.activityId, Math.max(prior, stars));
  }
  return [...best.entries()].map(([activityId, stars]) => ({ activityId, stars }));
}

/** Outcome tally across a learner's skills (for the dashboard summary). */
export async function skillOutcomeCounts(
  accountId: string,
  learnerId: string,
  skills: SkillTag[],
): Promise<Record<SkillOutcome, number>> {
  const owned = await getLearner(accountId, learnerId);
  const counts: Record<SkillOutcome, number> = { not_yet: 0, emerging: 0, solid: 0 };
  if (!owned || skills.length === 0) return counts;
  const rows = await getDb()
    .select({ skill: skillState.skill, outcome: skillState.outcome })
    .from(skillState)
    .where(and(eq(skillState.learnerId, learnerId), inArray(skillState.skill, skills)));
  const bySkill = new Map(rows.map((r) => [r.skill, r.outcome as SkillOutcome]));
  for (const s of skills) counts[bySkill.get(s) ?? "not_yet"] += 1;
  return counts;
}
