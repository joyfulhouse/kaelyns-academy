// server-only: this module opens DB connections and must never be imported into
// a Client Component. (the `server-only` package isn't installed; this comment
// is the guard, and only server actions / route handlers import it.)
import { and, asc, count, desc, eq, inArray, lt, lte, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  attempt,
  checkpointResult,
  deletionAudit,
  enrollment,
  generatedActivity,
  interest,
  learner,
  learnerInterest,
  learnerQuest,
  learnerSticker,
  oralReadingVerification,
  reviewSchedule,
  skillState,
  starLedger,
  user,
  verification,
} from "@/lib/db/schema";
import type { Activity, ActivityScore, Lesson, SkillOutcome, SkillTag, Unit } from "@/content";
import type { ActivityKind } from "@/content/activity-configs";
import { SHELF_BATCH, SHELF_LESSON_CAP } from "./shelf";
import { deriveOutcome, type DayKey, type SkillRecord, type SkillState } from "./mastery";
import {
  enrollmentConfigSchema,
  learnerSettingsSchema,
  type EnrollmentConfig,
  type LearnerSettings,
} from "@/lib/content/config";
import { getPublishedVersionId } from "@/lib/content/store";
import { earnedStarsForAttempt } from "@/lib/rewards/logic";
import { computePlacement, outcomeToRate, type PlacementVerdict } from "@/lib/placement/placement";
import { canTransitionStatus, type EnrollmentDetail, type EnrollmentStatus } from "./enrollment";
import { shapeLearnerExport, type LearnerExport } from "./export";
import { shapeAccountExport, type AccountExport } from "./account-export";
import { parseJsonbFailClosed } from "./jsonb";
import { getLearner, toLearnerRow, withOwnedLearner, type LearnerRow } from "./scope";
import { applyAttemptToQuests } from "@/lib/quests/store";
import { unitSkills } from "./recommend";
import { nextSchedule, type ReviewScheduleState } from "./schedule";
import { responseSchema as oralReadingResponseSchema } from "@/activities/oral-reading/logic";

/** The transaction type recordAttempt's tx-scoped helpers share (mirrors the
 *  same derivation in src/lib/quests/store.ts). */
type Db = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// getLearner + LearnerRow now live in ./scope (the shared account-ownership gate);
// re-export them so existing importers of "@/lib/tutor/store" keep their paths.
export { getLearner } from "./scope";
export type { LearnerRow };

/**
 * The DB-backed tutor store: the server equivalent of the client's
 * useSkillState. Every read/write is scoped to an account (the Better Auth
 * user), so one parent can only ever touch their own learners' data (spec §7).
 * The mastery engine (deriveOutcome) is applied here so client and server agree
 * on what "solid" means.
 */

/** Bound stored evidence (jsonb can otherwise grow without limit). */
const MAX_HISTORY = 24;

/** A witness only bridges the upload and its immediate completion save. */
export const ORAL_READING_VERIFICATION_TTL_MS = 5 * 60_000;

const oralVerificationIdentitySchema = z.object({
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  unitKey: z.string().min(1).max(100),
  activityId: z.string().min(1).max(100),
});

const newOralReadingVerificationSchema = z.discriminatedUnion("mode", [
  oralVerificationIdentitySchema
    .extend({
      mode: z.literal("word"),
      result: z.enum(["matched", "unclear", "no-speech"]),
      perWord: z.null(),
      correctCount: z.number().int().min(0).max(1),
      totalWords: z.literal(1),
      wcpm: z.null(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if ((value.result === "matched") !== (value.correctCount === 1)) {
        ctx.addIssue({ code: "custom", path: ["correctCount"], message: "result mismatch" });
      }
    }),
  oralVerificationIdentitySchema
    .extend({
      mode: z.literal("sentence"),
      result: z.enum(["matched", "unclear"]),
      perWord: z
        .array(z.object({ state: z.enum(["correct", "unclear"]) }).strict())
        .min(1)
        .max(7),
      correctCount: z.number().int().min(0).max(7),
      totalWords: z.number().int().min(1).max(7),
      wcpm: z.number().int().min(0).max(300).nullable(),
    })
    .strict()
    .superRefine((value, ctx) => {
      const derivedCorrect = value.perWord.filter(({ state }) => state === "correct").length;
      if (value.perWord.length !== value.totalWords) {
        ctx.addIssue({ code: "custom", path: ["totalWords"], message: "word count mismatch" });
      }
      if (derivedCorrect !== value.correctCount) {
        ctx.addIssue({
          code: "custom",
          path: ["correctCount"],
          message: "correct count mismatch",
        });
      }
      if ((value.result === "matched") !== (derivedCorrect === value.totalWords)) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "result mismatch" });
      }
    }),
]);

export type NewOralReadingVerification = z.infer<
  typeof newOralReadingVerificationSchema
>;

/**
 * Persist one privacy-safe verification result after re-checking learner
 * ownership. The expiry is server-issued; callers cannot extend witness life.
 */
export async function createOralReadingVerification(
  accountId: string,
  input: NewOralReadingVerification,
): Promise<string> {
  const parsed = newOralReadingVerificationSchema.parse(input);
  const owned = await getLearner(accountId, parsed.learnerId);
  if (!owned) throw new Error("learner not found for account");

  const rows = await getDb()
    .insert(oralReadingVerification)
    .values({
      ...parsed,
      expiresAt: new Date(Date.now() + ORAL_READING_VERIFICATION_TTL_MS),
    })
    .returning({ id: oralReadingVerification.id });
  const row = rows[0];
  if (!row) throw new Error("oral-reading verification was not persisted");
  return row.id;
}

/** Pure: fold one attempt's evidence for a skill into its prior history and
 *  re-derive the outcome. Extracted so the gate logic is unit-testable.
 *  `source` defaults to "play" (the existing recordAttempt fold below passes
 *  none); applyPlacement (Adventure 2.0 C1) passes "baseline" so the
 *  source-aware gate in mastery.ts locks the entry solid immediately. */
export function nextSkillRecord(
  prior: { day: string; outcome: string; source?: string }[] | undefined,
  outcome: SkillOutcome,
  day: DayKey,
  source: "play" | "baseline" = "play",
): { history: { day: string; outcome: SkillOutcome; source?: "play" | "baseline" }[]; outcome: SkillOutcome } {
  const entry = source === "baseline" ? { day, outcome, source } : { day, outcome };
  const history = [...(prior ?? []), entry].slice(-MAX_HISTORY) as {
    day: string;
    outcome: SkillOutcome;
    source?: "play" | "baseline";
  }[];
  return { history, outcome: deriveOutcome({ history } as SkillRecord) };
}

/**
 * Fold one skill result into its sparse review schedule while the caller holds
 * that skill's skill_state lock. The durable derived outcome gates first-time
 * scheduling; once a schedule exists, the current attempt outcome drives
 * promotion/demotion because mastery itself intentionally stays solid.
 */
async function upsertReviewSchedule(
  tx: Db,
  learnerId: string,
  programSlug: string,
  skill: SkillTag,
  derivedOutcome: SkillOutcome,
  attemptOutcome: SkillOutcome,
  day: DayKey,
): Promise<void> {
  const rows = await tx
    .select()
    .from(reviewSchedule)
    .where(and(eq(reviewSchedule.learnerId, learnerId), eq(reviewSchedule.skill, skill)))
    .limit(1)
    .for("update");
  const row = rows[0];
  const current: ReviewScheduleState | null = row
    ? {
        intervalIndex: row.intervalIndex,
        nextReviewOn: row.nextReviewOn,
        lastReviewedOn: row.lastReviewedOn,
        lastOutcome: row.lastOutcome as SkillOutcome | null,
      }
    : null;
  // The ladder only moves on a genuine REVIEW — i.e. when the skill was due
  // (nextReviewOn <= day). Incidental practice of an already-scheduled skill
  // that is not yet due must not promote/demote it, or normal adventure play
  // would thrash the schedule. (First-time scheduling, current === null, still
  // proceeds.)
  if (current && current.nextReviewOn > day) return;
  const schedule = nextSchedule(current, current ? attemptOutcome : derivedOutcome, day);
  if (!schedule) return;

  await tx
    .insert(reviewSchedule)
    .values({ learnerId, skill, programSlug, ...schedule })
    .onConflictDoUpdate({
      target: [reviewSchedule.learnerId, reviewSchedule.skill],
      set: { programSlug, ...schedule, updatedAt: new Date() },
    });
}

/**
 * Fold one checkpoint attempt's per-skill outcomes into the (learner, unit,
 * phase) checkpoint_result row as first-try rates. Upserts the row (status
 * "pending"); merges the new per-skill rates into the existing scores map. Does
 * NOT touch skill_state (placement is parent-gated).
 */
async function upsertCheckpointScore(
  tx: Db,
  learnerId: string,
  enrollmentId: string,
  unitId: string,
  phase: string,
  evidence: { skill: string; outcome: string }[],
): Promise<void> {
  await tx
    .insert(checkpointResult)
    .values({ learnerId, enrollmentId, unitId, phase, scores: {}, status: "pending" })
    .onConflictDoNothing({
      target: [checkpointResult.learnerId, checkpointResult.unitId, checkpointResult.phase],
    });
  const rows = await tx
    .select()
    .from(checkpointResult)
    .where(
      and(
        eq(checkpointResult.learnerId, learnerId),
        eq(checkpointResult.unitId, unitId),
        eq(checkpointResult.phase, phase),
      ),
    )
    .limit(1)
    .for("update");
  const row = rows[0];
  if (!row) return;
  const scores = { ...row.scores };
  for (const ev of evidence) {
    // First-write-wins: a baseline captures each skill's FIRST-try signal from the
    // first probe that touches it. Later attempts (incl. a replay, and area-mode's
    // incidental mult.facts side-emit) must NOT clobber it — otherwise a stumble on
    // a harder later task erases a clean earlier demonstration. checkpoint_result
    // scores are placement evidence, not appended history.
    if (!(ev.skill in scores)) scores[ev.skill] = outcomeToRate(ev.outcome as SkillOutcome);
  }
  await tx.update(checkpointResult).set({ scores }).where(eq(checkpointResult.id, row.id));
}

export async function listLearners(accountId: string): Promise<LearnerRow[]> {
  const rows = await getDb()
    .select()
    .from(learner)
    .where(eq(learner.accountId, accountId))
    .orderBy(learner.createdAt);
  return rows.map(toLearnerRow);
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
  return toLearnerRow(rows[0]);
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

/**
 * Lazily create a (learner, program) enrollment, pinned to the program's CURRENT
 * published version at creation time (Fix-E Layer 3). Resolving
 * `getPublishedVersionId` and storing it as `programVersionId` means a
 * default/self-enroll learner is anchored to the version they started on and does
 * NOT silently follow whatever publishes next — matching parent-assigned
 * enrollments (assignProgram), which already pin. A static builtin with no DB
 * published version resolves to null → null pin → the learner surface serves the
 * static tree (correct). Kept `onConflictDoNothing`: an existing or soft-removed
 * enrollment is never repinned or resurrected (a paused/removed program stays so,
 * and a learner mid-program is never moved to a newer pin). No backfill of
 * pre-existing rows is done (pilot: no durable enrollment data to migrate).
 */
export async function ensureEnrollment(learnerId: string, programSlug: string): Promise<void> {
  const programVersionId = await getPublishedVersionId(programSlug);
  await getDb()
    .insert(enrollment)
    .values({ learnerId, programSlug, programVersionId })
    .onConflictDoNothing({ target: [enrollment.learnerId, enrollment.programSlug] });
}

/**
 * Thrown by {@link recordAttempt} when the learner has no ACTIVE enrollment for
 * the program the attempt belongs to (Fix-F A4). The attempt is NOT persisted;
 * the action maps this to `reason: "inactive"`. This is the server-authoritative
 * curation gate: progress can never be written for a removed/paused/unassigned
 * program, even via a direct API call that bypasses the kid-surface render-block.
 */
export class EnrollmentNotActiveError extends Error {
  constructor(learnerId: string, programSlug: string) {
    super(`No active enrollment for learner "${learnerId}" in program "${programSlug}"`);
    this.name = "EnrollmentNotActiveError";
  }
}

/** A completion UUID may only ever identify one immutable attempt identity. */
export class CompletionReplayMismatchError extends Error {
  constructor() {
    super("completion id belongs to a different attempt identity");
    this.name = "CompletionReplayMismatchError";
  }
}

/** The (learner, program) composite predicate shared by every single-enrollment
 *  query (keyed on the `enrollment_learner_program_uq` unique index). */
function enrollmentKey(learnerId: string, programSlug: string) {
  return and(eq(enrollment.learnerId, learnerId), eq(enrollment.programSlug, programSlug));
}

export interface RecordAttemptInput {
  learnerId: string;
  /** The program the activity belongs to — the active-enrollment gate keys on it. */
  programSlug: string;
  /** One browser completion token, reused verbatim for every retry. */
  completionId: string;
  activityId: string;
  kind: string;
  generated?: boolean;
  response?: unknown;
  score: ActivityScore;
  /** YYYY-MM-DD; defaults to today (caller's clock). */
  day: DayKey;
  /**
   * AI provenance for a generated attempt (P6 / §8). Persisted ONLY when
   * `generated` is true; metadata only (model/route/at), never a raw prompt.
   * Absent for authored attempts → the gen_* columns stay null.
   */
  provenance?: { model: string; route: string; at: Date };
  /** Quest-fold context (Adventure 2.0): the containing unit id, resolved
   *  server-side by the action from the learner's pinned tree. Null when
   *  unresolvable — complete_n still counts; unit-targeted quests just miss. */
  unitId?: string | null;
  /**
   * Server-derived in the action — TRUE only when the activityId was verified
   * to belong to the learner's pinned authored tree. Never client-supplied.
   * Gates the star-ledger earn; the attempt/skill folds are unaffected.
   */
  creditEligible: boolean;
  /**
   * Server-derived in the action (Adventure 2.0 B3) — TRUE only when a GENERATED
   * attempt's activityId was verified to be a real shelf row owned by the learner
   * (getGeneratedActivity). Never client-supplied — same contract as
   * creditEligible. Lets a generated shelf item earn ledger stars exactly once;
   * the first-completion dedupe then counts prior GENERATED attempts for the id.
   * Falsy leaves the authored/in-session-practice earn byte-identical.
   */
  shelfEligible?: boolean;
  /**
   * When the attempt's unit is a checkpoint (baseline/mid/final), its evidence
   * folds into checkpoint_result INSTEAD of skill_state — nothing about the
   * learner's level changes until a parent applies the placement (§3, §7).
   * Resolved server-side by the action from the unit's authored `checkpoint`.
   */
  checkpointPhase?: "baseline" | "mid" | "final" | null;
}

/**
 * Record one completed activity and fold its skill evidence into skill_state.
 * Verifies the learner belongs to the account AND has an ACTIVE enrollment for
 * the program (tenancy + curation boundaries), both inside the transaction.
 * @throws when the learner is not owned by the account (tenancy).
 * @throws {EnrollmentNotActiveError} when no ACTIVE enrollment exists for the
 *   (learner, programSlug) pair — nothing is persisted (server-authoritative
 *   curation gate, Fix-F A4).
 */
export async function recordAttempt(
  accountId: string,
  input: RecordAttemptInput,
): Promise<ActivityScore> {
  // The attempt row and every per-skill fold must commit together: a partial
  // write (attempt saved, skill_state not) loses mastery evidence, and two
  // concurrent submits racing the read-modify-write would otherwise either
  // throw a unique violation after the attempt row is already in, or drop one
  // submit's evidence (last-writer-wins). One transaction + a row lock per
  // (learner,skill) makes the whole thing atomic and serialized.
  return getDb().transaction((tx) => recordAttemptInTransaction(tx, accountId, input));
}

/** Existing attempt writer, parameterized by a caller-owned transaction so the
 * oral-reading witness claim can commit atomically with the unchanged ledger,
 * mastery, checkpoint, review, and quest folds below. */
async function recordAttemptInTransaction(
  tx: Db,
  accountId: string,
  input: RecordAttemptInput,
): Promise<ActivityScore> {
    // Tenancy boundary, re-checked inside the tx so it shares the snapshot.
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, input.learnerId), eq(learner.accountId, accountId)))
      .limit(1);
    if (!owned[0]) throw new Error("learner not found for account");

    // Curation boundary (Fix-F A4): the learner must be ACTIVELY enrolled in the
    // program. Read inside the same tx (shares the snapshot with the tenancy
    // check above). A removed/paused/missing enrollment → no write at all; the
    // client render-block (A3) is the UX, this is the non-bypassable enforcement.
    const enrolled = await tx
      .select({ id: enrollment.id, status: enrollment.status, config: enrollment.config })
      .from(enrollment)
      .where(enrollmentKey(input.learnerId, input.programSlug))
      .limit(1)
      // Lock the enrollment row for the tx's lifetime so a concurrent pause/remove
      // can't commit between this active-check and the attempt insert below (the
      // skill_state folds already lock FOR UPDATE; this closes the same race here).
      .for("update");
    const parsedEnrollmentConfig = enrollmentConfigSchema.safeParse(enrolled[0]?.config);
    const activeUnitKeys = parsedEnrollmentConfig.success
      ? parsedEnrollmentConfig.data.activeUnitKeys
      : undefined;
    if (
      enrolled[0]?.status !== "active" ||
      !parsedEnrollmentConfig.success ||
      (activeUnitKeys !== undefined &&
        activeUnitKeys.length > 0 &&
        (!input.unitId || !activeUnitKeys.includes(input.unitId)))
    ) {
      throw new EnrollmentNotActiveError(input.learnerId, input.programSlug);
    }
    const enrollmentId = enrolled[0].id;

    // Provenance is written ONLY for a generated attempt (and only when supplied),
    // so an authored row can never carry gen_* metadata even if a caller passes it.
    const generated = input.generated ?? false;
    const provenance = generated ? input.provenance : undefined;
    const inserted = await tx
      .insert(attempt)
      .values({
        learnerId: input.learnerId,
        completionId: input.completionId,
        activityId: input.activityId,
        kind: input.kind,
        generated,
        score: input.score,
        response: input.response ?? null,
        day: input.day,
        genModel: provenance?.model ?? null,
        genRoute: provenance?.route ?? null,
        genAt: provenance?.at ?? null,
      })
      .onConflictDoNothing({ target: [attempt.learnerId, attempt.completionId] })
      .returning({ id: attempt.id });

    // A concurrent or retried completion lost the unique-key insert. Replay the
    // original canonical score and return before ANY derived fold. PostgreSQL's
    // INSERT conflict check waits for an in-flight winner, and the following
    // READ COMMITTED statement can then see that committed row.
    if (!inserted[0]) {
      const replayed = await tx
        .select({
          activityId: attempt.activityId,
          kind: attempt.kind,
          generated: attempt.generated,
          score: attempt.score,
        })
        .from(attempt)
        .where(
          and(
            eq(attempt.learnerId, input.learnerId),
            eq(attempt.completionId, input.completionId),
          ),
        )
        .limit(1);
      const original = replayed[0];
      if (!original) {
        throw new Error("completion id conflict could not be replayed");
      }
      if (
        original.activityId !== input.activityId ||
        original.kind !== input.kind ||
        original.generated !== generated
      ) {
        throw new CompletionReplayMismatchError();
      }
      return original.score;
    }

    // Star economy (Adventure 2.0): first authored completion earns score.stars
    // into the append-only ledger, inside this same transaction (all-or-nothing
    // with the attempt). Repeats/generated earn 0 (v1 grind-proof rule) — EXCEPT
    // a server-verified generated shelf item (B3), which earns exactly once.
    const shelfEligible = input.shelfEligible === true;
    // The "already completed once" witness. An AUTHORED attempt dedupes against
    // prior AUTHORED (generated=false) rows for this activity; a GENERATED shelf
    // item dedupes against prior GENERATED (generated=true) rows for the same
    // generated id — so it too earns exactly once. Both counts include the row we
    // just inserted, so >1 means a repeat. (For an authored attempt shelfEligible
    // is false → predicate is generated=false → byte-identical to before.)
    const prior = await tx
      .select({ id: attempt.id })
      .from(attempt)
      .where(
        and(
          eq(attempt.learnerId, input.learnerId),
          eq(attempt.activityId, input.activityId),
          eq(attempt.generated, shelfEligible),
        ),
      )
      .limit(2); // the row we just inserted + any earlier one
    // Membership witness gate (Codex critical): earnedStarsForAttempt stays pure
    // (it never sees creditEligible); the caller here refuses to even ask for a
    // star credit unless the action already verified activityId belongs to the
    // learner's own pinned tree (authored) OR is a real shelf row owned by the
    // learner (generated, B3). A forged fresh activityId can no longer mint stars
    // just because no prior attempt row exists for it.
    const earned =
      input.creditEligible || shelfEligible
        ? earnedStarsForAttempt({
            generated,
            stars: input.score.stars,
            alreadyCompleted: prior.length > 1,
            shelfEligible,
          })
        : 0;
    if (earned > 0) {
      await tx.insert(starLedger).values({
        learnerId: input.learnerId,
        delta: earned,
        reason: "activity_complete",
        refId: input.activityId,
      });
    }

    // Checkpoint attempts (baseline/mid/final) capture to checkpoint_result and
    // do NOT advance skill_state or quests — placement is parent-gated (§3).
    if (input.checkpointPhase) {
      await upsertCheckpointScore(
        tx,
        input.learnerId,
        enrollmentId,
        input.unitId ?? "",
        input.checkpointPhase,
        input.score.skillEvidence,
      );
    } else {
      // Acquire the per-skill row locks in a deterministic (skill-sorted) order:
      // two concurrent attempts for the same learner with overlapping skills would
      // otherwise be able to lock the same rows in opposite orders and deadlock —
      // which Postgres breaks by aborting one tx, dropping that submit's evidence.
      const evidence = [...input.score.skillEvidence].sort((a, b) => a.skill.localeCompare(b.skill));
      for (const ev of evidence) {
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
        await upsertReviewSchedule(
          tx,
          input.learnerId,
          input.programSlug,
          ev.skill,
          outcome,
          ev.outcome,
          input.day,
        );
      }

      // Adventure 2.0: fold this attempt into today's ACTIVE quests + credit any
      // completed quest's reward — inside this same transaction. Gated on
      // questEligible (Codex round 2, Important #1): GENERATED practice
      // legitimately has no authored-tree membership and still counts toward
      // the day's active quest (any kind — complete_n, or practice_skill/try_strand
      // via the attempt's skillEvidence; bounded ≤ daily quests, active-quest-only,
      // once each — accepted residual, design intent unchanged). An AUTHORED
      // attempt counts toward quests ONLY when
      // creditEligible (server-verified tree membership) is true — otherwise the
      // program-unresolvable branch could complete a complete_n quest and credit
      // quest_complete stars even though the star-ledger activity_complete earn
      // was correctly withheld above. Skipping the fold entirely (rather than
      // passing a flag through) is correct: no quest should advance from an
      // attempt whose membership couldn't be verified.
      const questEligible = generated || input.creditEligible;
      if (questEligible) {
        await applyAttemptToQuests(tx, input.learnerId, input.programSlug, input.day, {
          activityId: input.activityId,
          unitId: input.unitId ?? null,
          skills: input.score.skillEvidence.map((e) => e.skill),
          generated,
        });
      }
    }
  return input.score;
}

export interface OralReadingWitnessFacts {
  mode: "word" | "sentence";
  result: "matched" | "unclear" | "no-speech";
  perWord: { state: "correct" | "unclear" }[] | null;
  correctCount: number;
  totalWords: number;
  wcpm: number | null;
}

export interface RecordOralReadingAttemptInput {
  learnerId: string;
  programSlug: string;
  completionId: string;
  unitKey: string;
  activityId: string;
  verificationId?: string;
  day: DayKey;
  checkpointPhase?: "baseline" | "mid" | "final" | null;
  canonicalize: (
    witness: OralReadingWitnessFacts | null,
  ) => { response: unknown; score: ActivityScore } | null;
}

/**
 * Claim one oral-reading witness and write its canonical attempt in the same
 * transaction. A learner-row lock serializes this low-volume path per learner,
 * making completion reuse deterministic before either unique constraint is
 * reached. A committed witness may replay only its original completion id,
 * including after expiry; an unconsumed expired witness is never accepted.
 */
export async function recordOralReadingAttempt(
  accountId: string,
  input: RecordOralReadingAttemptInput,
): Promise<ActivityScore | null> {
  return getDb().transaction(async (tx) => {
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, input.learnerId), eq(learner.accountId, accountId)))
      .limit(1)
      .for("update");
    if (!owned[0]) return null;

    let witnessRow: typeof oralReadingVerification.$inferSelect | null = null;
    let witnessFacts: OralReadingWitnessFacts | null = null;
    if (input.verificationId) {
      const rows = await tx
        .select()
        .from(oralReadingVerification)
        .where(eq(oralReadingVerification.id, input.verificationId))
        .limit(1)
        .for("update");
      witnessRow = rows[0] ?? null;
      if (
        !witnessRow ||
        witnessRow.learnerId !== input.learnerId ||
        witnessRow.programSlug !== input.programSlug ||
        witnessRow.unitKey !== input.unitKey ||
        witnessRow.activityId !== input.activityId
      ) {
        return null;
      }

      if (
        witnessRow.consumedCompletionId &&
        witnessRow.consumedCompletionId !== input.completionId
      ) {
        return null;
      }
      const committedReplay = witnessRow.consumedCompletionId === input.completionId;
      if (committedReplay) {
        // The witness and attempt committed together, so a retry can return the
        // original score without re-scoring current content or re-folding any
        // ledger/mastery state. Preserve the ordinary active-enrollment gate.
        const enrolled = await tx
          .select({ status: enrollment.status })
          .from(enrollment)
          .where(enrollmentKey(input.learnerId, input.programSlug))
          .limit(1)
          .for("update");
        if (enrolled[0]?.status !== "active") {
          throw new EnrollmentNotActiveError(input.learnerId, input.programSlug);
        }
        const replayed = await tx
          .select({
            activityId: attempt.activityId,
            kind: attempt.kind,
            generated: attempt.generated,
            score: attempt.score,
          })
          .from(attempt)
          .where(
            and(
              eq(attempt.learnerId, input.learnerId),
              eq(attempt.completionId, input.completionId),
            ),
          )
          .limit(1);
        const original = replayed[0];
        return original &&
          original.activityId === input.activityId &&
          original.kind === "oral-reading" &&
          original.generated === false
          ? original.score
          : null;
      }
      if (!committedReplay && witnessRow.expiresAt.getTime() <= Date.now()) return null;

      if (!committedReplay) {
        // One completion may bind to only one witness. The learner lock closes
        // the concurrent two-witness race before either unique index is reached.
        const consumed = await tx
          .select({ id: oralReadingVerification.id })
          .from(oralReadingVerification)
          .where(
            and(
              eq(oralReadingVerification.learnerId, input.learnerId),
              eq(oralReadingVerification.consumedCompletionId, input.completionId),
            ),
          )
          .limit(1)
          .for("update");
        if (consumed.some(({ id }) => id !== witnessRow?.id)) return null;

        // A pre-witness or participation-only attempt may already own the same
        // completion id. It cannot be retroactively upgraded with a new witness.
        const existingAttempt = await tx
          .select({ completionId: attempt.completionId })
          .from(attempt)
          .where(
            and(
              eq(attempt.learnerId, input.learnerId),
              eq(attempt.completionId, input.completionId),
            ),
          )
          .limit(1);
        if (existingAttempt[0]) return null;
      }

      const mode = witnessRow.mode;
      const result = witnessRow.result;
      if (
        (mode !== "word" && mode !== "sentence") ||
        (result !== "matched" && result !== "unclear" && result !== "no-speech")
      ) {
        return null;
      }
      witnessFacts = {
        mode,
        result,
        perWord: witnessRow.perWord,
        correctCount: witnessRow.correctCount ?? 0,
        totalWords: witnessRow.totalWords ?? 0,
        wcpm: witnessRow.wcpm,
      };
    }

    const canonical = input.canonicalize(witnessFacts);
    if (!canonical) return null;
    const score = await recordAttemptInTransaction(tx, accountId, {
      learnerId: input.learnerId,
      programSlug: input.programSlug,
      completionId: input.completionId,
      activityId: input.activityId,
      kind: "oral-reading",
      generated: false,
      response: canonical.response,
      score: canonical.score,
      day: input.day,
      unitId: input.unitKey,
      creditEligible: true,
      shelfEligible: false,
      checkpointPhase: input.checkpointPhase ?? null,
    });

    if (witnessRow && !witnessRow.consumedCompletionId) {
      await tx
        .update(oralReadingVerification)
        .set({ consumedCompletionId: input.completionId })
        .where(eq(oralReadingVerification.id, witnessRow.id));
    }
    return score;
  });
}

/** Read the learner's skill_state in the mastery engine's shape (for next-best,
 *  per-strand levels, and the parent report). */
export async function getSkillState(accountId: string, learnerId: string): Promise<SkillState> {
  return withOwnedLearner<SkillState>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb().select().from(skillState).where(eq(skillState.learnerId, learnerId));
      const state: SkillState = {};
      for (const r of rows) {
        state[r.skill as SkillTag] = { history: r.evidence as { day: string; outcome: SkillOutcome }[] };
      }
      return state;
    },
    {},
  );
}

/** One due authored destination, ordered by the skill schedule that surfaced it. */
export interface DueReview {
  skill: SkillTag;
  nextReviewOn: string;
  activity: Activity;
  unit: Unit;
  lesson: Lesson;
}

const MAX_DUE_SKILLS = 24;
const MAX_DUE_REVIEWS = 8;

/**
 * Resolve due skill schedules to replayable authored activities in the
 * learner's version-pinned program tree. The read is account-owned, scoped to
 * one program and calendar day, and omits authored activities already played
 * today so the Warm-up row never immediately repeats completed work.
 */
export async function getDueReviews(
  accountId: string,
  learnerId: string,
  programSlug: string,
  today: string,
): Promise<DueReview[]> {
  return withOwnedLearner<DueReview[]>(
    accountId,
    learnerId,
    async () => {
      // Lazy to keep the repository ↔ tutor-store enrollment-pin seam free of a
      // module-initialization cycle. No resolver or DB factory runs at import time.
      const { resolveAccountLearnerProgram } = await import("@/lib/content/repository");
      const program = await resolveAccountLearnerProgram(accountId, learnerId, programSlug);
      if (!program) return [];

      const [scheduled, completedToday] = await Promise.all([
        getDb()
          .select()
          .from(reviewSchedule)
          .where(
            and(
              eq(reviewSchedule.learnerId, learnerId),
              eq(reviewSchedule.programSlug, programSlug),
              lte(reviewSchedule.nextReviewOn, today),
            ),
          )
          .orderBy(asc(reviewSchedule.nextReviewOn), asc(reviewSchedule.skill))
          .limit(MAX_DUE_SKILLS),
        getDb()
          .select({ activityId: attempt.activityId })
          .from(attempt)
          .where(
            and(
              eq(attempt.learnerId, learnerId),
              eq(attempt.day, today),
              eq(attempt.generated, false),
            ),
          )
          .limit(5000),
      ]);
      const completedIds = new Set(completedToday.map((row) => row.activityId));
      const seenActivityIds = new Set<string>();
      const reviews: DueReview[] = [];

      // Surface at most ONE authored activity per due skill so a skill that
      // appears in many activities doesn't flood the Warm-up row.
      dueLoop: for (const due of scheduled) {
        for (const unit of program.units) {
          // Never resurface a checkpoint/assessment unit as casual review: its
          // activities route to the checkpoint branch of recordAttempt (which
          // skips skill_state + the scheduler), so the schedule would never
          // advance and the assessment could repeat under Warm-up framing.
          if (unit.checkpoint) continue;
          if (!unitSkills(unit).includes(due.skill)) continue;
          for (const lesson of unit.lessons) {
            for (const activity of lesson.activities) {
              if (!activity.skillTags.includes(due.skill)) continue;
              if (completedIds.has(activity.id) || seenActivityIds.has(activity.id)) continue;
              reviews.push({
                skill: due.skill,
                nextReviewOn: due.nextReviewOn,
                activity,
                unit,
                lesson,
              });
              seenActivityIds.add(activity.id);
              if (reviews.length >= MAX_DUE_REVIEWS) return reviews;
              continue dueLoop;
            }
          }
        }
      }
      return reviews;
    },
    [],
  );
}

// ── Adventure 2.0 C1: baseline placement (checkpoint_result → skill_state) ───
//
// A checkpoint attempt captures to checkpoint_result (upsertCheckpointScore
// above) WITHOUT touching skill_state — nothing about the learner's level
// changes until a parent reviews the per-skill verdicts and applies the
// placement (spec §3.5). The three functions below are that parent-gated flow.

/** One checkpoint result, its per-skill placement verdicts, and the seed set —
 *  everything the parent panel needs to show + confirm/redo a check-in. */
export interface PendingCheckpoint {
  id: string;
  unitId: string;
  phase: string;
  status: string;
  createdAt: string;
  verdicts: PlacementVerdict[];
  seed: SkillTag[];
}

/** All of a learner's checkpoint results (owned-by-account), each with its
 *  computed placement verdicts + seed set, newest first. */
export async function getPendingCheckpointResults(
  accountId: string,
  learnerId: string,
): Promise<PendingCheckpoint[]> {
  return withOwnedLearner<PendingCheckpoint[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(checkpointResult)
        .where(eq(checkpointResult.learnerId, learnerId))
        .orderBy(desc(checkpointResult.createdAt));
      return rows.map((r) => {
        const { seed, verdicts } = computePlacement(r.scores);
        return {
          id: r.id,
          unitId: r.unitId,
          phase: r.phase,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          verdicts,
          seed,
        };
      });
    },
    [],
  );
}

/**
 * Apply a baseline placement: seed skill_state solid (source "baseline") for
 * the breezed skills and flip the checkpoint result to "applied". Tenancy is
 * re-checked INSIDE the transaction (mirrors recordAttempt) so the ownership
 * gate and the seeding commit atomically. Idempotent — re-applying an
 * already-"applied" row is a no-op (checked after the row lock, before any
 * seeding write). One baseline-sourced solid entry per skill is enough: the
 * source-aware deriveOutcome (mastery.ts) locks it solid without waiting on
 * the day-gate. The seeded entry's day is the checkpoint result's own creation
 * day (not "today") so the evidence trail reflects when the check-in happened.
 */
export async function applyPlacement(accountId: string, checkpointResultId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(checkpointResult)
      .where(eq(checkpointResult.id, checkpointResultId))
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row) return;

    // Tenancy boundary, re-checked inside the tx (same pattern as recordAttempt).
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, row.learnerId), eq(learner.accountId, accountId)))
      .limit(1);
    if (!owned[0]) throw new Error("learner not found for account");

    if (row.status === "applied") return; // idempotent: nothing left to do

    const day = row.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const placementEnrollment = await tx
      .select({ programSlug: enrollment.programSlug })
      .from(enrollment)
      .where(eq(enrollment.id, row.enrollmentId))
      .limit(1);
    const programSlug = placementEnrollment[0]?.programSlug;
    const { seed } = computePlacement(row.scores);
    // Lock skill_state rows in a deterministic (alphabetical) order — same
    // deadlock-avoidance as recordAttempt's fold — so a concurrent recordAttempt
    // touching overlapping skills in a different order can't deadlock the two txs.
    const orderedSeed = [...seed].sort((a, b) => a.localeCompare(b));
    for (const skillTag of orderedSeed) {
      // Materialize the row (no-op if it already exists), then lock it FOR
      // UPDATE — same read-lock-then-update shape as recordAttempt's fold.
      await tx
        .insert(skillState)
        .values({ learnerId: row.learnerId, skill: skillTag, evidence: [], outcome: "not_yet" })
        .onConflictDoNothing({ target: [skillState.learnerId, skillState.skill] });
      const locked = await tx
        .select()
        .from(skillState)
        .where(and(eq(skillState.learnerId, row.learnerId), eq(skillState.skill, skillTag)))
        .limit(1)
        .for("update");
      const s = locked[0];
      if (!s) continue;
      const folded = nextSkillRecord(s.evidence, "solid", day, "baseline");
      await tx
        .update(skillState)
        .set({ evidence: folded.history, outcome: folded.outcome, updatedAt: new Date() })
        .where(eq(skillState.id, s.id));
      if (programSlug) {
        await upsertReviewSchedule(
          tx,
          row.learnerId,
          programSlug,
          skillTag,
          folded.outcome,
          "solid",
          day,
        );
      }
    }

    await tx
      .update(checkpointResult)
      .set({ status: "applied", appliedAt: new Date() })
      .where(eq(checkpointResult.id, row.id));
  });
}

/** Redo: delete the checkpoint result so the check-in is offered again.
 *  Tenancy-checked via getLearner (the row has no accountId of its own, so
 *  ownership is resolved through the learner it belongs to). No-ops when the
 *  row doesn't exist, isn't owned by this account, or is no longer "pending"
 *  (an already-`applied` row's audit trail must survive a stray redo call —
 *  the `status = "pending"` predicate is repeated on the DELETE itself so an
 *  applied row is never removed even if it flips status between the read
 *  above and this statement). */
export async function redoCheckpoint(accountId: string, checkpointResultId: string): Promise<void> {
  const rows = await getDb()
    .select()
    .from(checkpointResult)
    .where(eq(checkpointResult.id, checkpointResultId))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "pending") return;
  const owned = await getLearner(accountId, row.learnerId);
  if (!owned) return;
  await getDb()
    .delete(checkpointResult)
    .where(and(eq(checkpointResult.id, checkpointResultId), eq(checkpointResult.status, "pending")));
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
  return withOwnedLearner<RecentAttempt[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(attempt)
        .where(eq(attempt.learnerId, learnerId))
        .orderBy(desc(attempt.createdAt))
        .limit(limit);
      return rows.map((r) => ({ activityId: r.activityId, kind: r.kind, stars: r.score.stars, day: r.day }));
    },
    [],
  );
}

export interface FluencyPoint {
  day: string;
  wcpm: number;
}

/**
 * Chronological sentence-reading fluency evidence for the parent dashboard.
 * Word-mode oral-reading attempts have no WCPM value and are omitted. JSON is
 * narrowed in application code rather than cast in SQL so malformed legacy
 * response rows fail closed without breaking the whole series. Selects the
 * MOST RECENT `limit` attempts (desc) then returns them oldest→newest, so the
 * chart always tracks recent growth rather than freezing on the first 60 ever.
 */
export async function getFluencyHistory(
  accountId: string,
  learnerId: string,
  limit = 60,
): Promise<FluencyPoint[]> {
  return withOwnedLearner<FluencyPoint[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({
          day: attempt.day,
          response: attempt.response,
          createdAt: attempt.createdAt,
        })
        .from(attempt)
        .where(and(eq(attempt.learnerId, learnerId), eq(attempt.kind, "oral-reading")))
        .orderBy(desc(attempt.createdAt))
        .limit(limit);

      return rows
        .reverse()
        .flatMap(({ day, response }) => {
          // Sentence WCPM reaches the attempt only through a claimed server
          // witness. Re-parse the complete stored response defensively so
          // malformed/legacy partial JSON cannot enter the household chart.
          const parsed = oralReadingResponseSchema.safeParse(response);
          if (!parsed.success || parsed.data.fallbackUsed || parsed.data.wcpm === undefined) {
            return [];
          }
          return [{ day, wcpm: parsed.data.wcpm }];
        });
    },
    [],
  );
}

/** One AI-generated attempt for the parent-visible provenance trail (P6 / §8). */
interface GeneratedAttempt {
  activityId: string;
  kind: string;
  stars: number;
  /** Logical model route; null for pre-provenance generated rows. */
  model: string | null;
  /** Generation path tag (band or language id); null for pre-provenance rows. */
  route: string | null;
  /** ISO generation time; null when not recorded. */
  generatedAt: string | null;
  /** ISO time the attempt was recorded (always present); the keyset cursor key. */
  createdAt: string;
}

export interface GeneratedAttemptsPage {
  items: GeneratedAttempt[];
  /** Opaque cursor for the next page (ISO createdAt of the last row), or null at the end. */
  nextCursor: string | null;
}

/** Default + hard cap on the provenance page size (keeps the read bounded). */
const PROVENANCE_PAGE_DEFAULT = 20;
const PROVENANCE_PAGE_MAX = 50;

/**
 * The parent-visible "what the AI made" trail (P6 / spec §8): a learner's
 * AI-GENERATED attempts only (generated=true), account-scoped, newest-first,
 * keyset-paginated by createdAt. Reuses the `attempt_learner_generated_idx`
 * (learnerId, generated). Returns an empty page when the learner is not owned by
 * the account (tenancy boundary) — never another account's data.
 *
 * Keyset (not OFFSET) pagination: `cursor` is the ISO createdAt of the last row
 * seen; the next page is the generated attempts strictly older than it. We fetch
 * limit+1 to know whether a further page exists without a second count query.
 */
export async function listGeneratedAttempts(
  accountId: string,
  learnerId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<GeneratedAttemptsPage> {
  return withOwnedLearner<GeneratedAttemptsPage>(
    accountId,
    learnerId,
    async () => {
      const limit = Math.max(1, Math.min(PROVENANCE_PAGE_MAX, opts.limit ?? PROVENANCE_PAGE_DEFAULT));
      const cursorDate = opts.cursor ? new Date(opts.cursor) : null;
      const cursorValid = cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : null;

      const predicate = cursorValid
        ? and(
            eq(attempt.learnerId, learnerId),
            eq(attempt.generated, true),
            lt(attempt.createdAt, cursorValid),
          )
        : and(eq(attempt.learnerId, learnerId), eq(attempt.generated, true));

      const rows = await getDb()
        .select()
        .from(attempt)
        .where(predicate)
        .orderBy(desc(attempt.createdAt))
        .limit(limit + 1); // +1 to detect a further page

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const items: GeneratedAttempt[] = page.map((r) => ({
        activityId: r.activityId,
        kind: r.kind,
        stars: clampStars(r.score.stars),
        model: r.genModel,
        route: r.genRoute,
        generatedAt: r.genAt ? r.genAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }));
      const nextCursor = hasMore ? items[items.length - 1]!.createdAt : null;
      return { items, nextCursor };
    },
    { items: [], nextCursor: null },
  );
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

/** Fold a set of attempt rows into best (highest) clamped stars per activityId. */
function foldBestStars(
  rows: readonly { activityId: string; score: { stars: number } }[],
): CompletedActivity[] {
  const best = new Map<string, number>();
  for (const r of rows) {
    const stars = clampStars(r.score.stars);
    const prior = best.get(r.activityId) ?? 0;
    if (stars > prior || !best.has(r.activityId)) best.set(r.activityId, Math.max(prior, stars));
  }
  return [...best.entries()].map(([activityId, stars]) => ({ activityId, stars }));
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
  return withOwnedLearner<CompletedActivity[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ activityId: attempt.activityId, score: attempt.score })
        .from(attempt)
        .where(and(eq(attempt.learnerId, learnerId), eq(attempt.generated, false)))
        // Bound this otherwise-unbounded select (one learner's authored-attempt volume
        // is far below this, so the best-stars fold stays complete). Order newest-first
        // so that IF the cap is ever hit the dropped rows are deterministic (the oldest
        // attempts) rather than an arbitrary set; index-backed by attempt_learner_created_idx.
        .orderBy(desc(attempt.createdAt))
        .limit(5000);
      return foldBestStars(rows);
    },
    [],
  );
}

/**
 * Best stars (0..3) per GENERATED attempt (generated=true), folded like
 * {@link getCompletedActivityIds}. A generated SHELF item is a durable, one-time
 * star earner whose completion must survive the learner surface's post-record
 * reconcile — so its best stars are read here and the caller scopes them to the
 * learner's live shelf ids (via {@link import("./shelf").shelfCompletions}); an
 * ephemeral in-session "More" attempt (activityId = an authored id, never a shelf
 * row) has no matching shelf id and is naturally excluded. Bounded + newest-first
 * exactly like the authored read.
 */
export async function getGeneratedCompletions(
  accountId: string,
  learnerId: string,
): Promise<CompletedActivity[]> {
  return withOwnedLearner<CompletedActivity[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ activityId: attempt.activityId, score: attempt.score })
        .from(attempt)
        .where(and(eq(attempt.learnerId, learnerId), eq(attempt.generated, true)))
        .orderBy(desc(attempt.createdAt))
        .limit(5000);
      return foldBestStars(rows);
    },
    [],
  );
}

// ── Adaptive generation shelf (Adventure 2.0 B3, spec §4) ────────────────────
//
// Durable, learner-private AI-generated practice. One generated_activity row per
// item, persisted only after the item passed schema + kind validation upstream
// (generatePracticeItems). Never part of the shared authored curriculum, so it
// lives in its own table and is always account-scoped like every other read.

/** A shelf item as the learner surface + the action need it (client-safe). */
export interface ShelfItem {
  id: string;
  lessonId: string;
  unitKey: string;
  kind: ActivityKind;
  title: string;
  skillTags: string[];
  /** ISO creation time (the deterministic shelf sort key). */
  createdAt: string;
}

/** One row to persist: everything but the (account-derived) learnerId, which
 *  {@link withLessonGenerationLock} stamps from the ownership-checked call. */
export interface NewGeneratedActivity {
  programSlug: string;
  unitKey: string;
  lessonId: string;
  kind: ActivityKind;
  title: string;
  /** The validated kind config (zod + kind-validated before it reached here). */
  config: unknown;
  skillTags: string[];
  genModel: string;
  genRoute: string;
  genAt: Date;
}

/** A single generated activity incl. its playable config + kind (Task 4 reads
 *  this to render/score a generated item). */
export interface GeneratedActivityRow {
  id: string;
  lessonId: string;
  unitKey: string;
  programSlug: string;
  kind: ActivityKind;
  title: string;
  config: unknown;
  skillTags: string[];
  /** Server-stored generation provenance; never accepted from the browser. */
  gen: { model: string; route: string; at: string } | null;
}

/**
 * A shelf item resolved for play by account + selected learner + program.
 * Carries the playable `config`/`kind` plus stored generation provenance for
 * display; attempt recording reloads the authoritative row server-side.
 * Client-safe: no Date objects cross the server→client boundary.
 */
export interface PlayableShelfItem {
  id: string;
  /** Owning learner identity, used by the client as a render-boundary witness. */
  learnerId: string;
  lessonId: string;
  unitKey: string;
  programSlug: string;
  kind: ActivityKind;
  title: string;
  config: unknown;
  skillTags: string[];
  gen: { model: string; route: string; at: string };
}

/**
 * One shelf item resolved for play through account + selected learner + program.
 * The owning learner is repeated in the bounded DTO so the client can fail
 * closed across a learner switch before mounting a Player. The store boundary
 * remains authoritative: tenancy is checked first, then every row dimension is
 * constrained in the generated_activity query.
 */
export async function getPlayableGeneratedActivity(
  accountId: string,
  learnerId: string,
  programSlug: string,
  id: string,
): Promise<PlayableShelfItem | null> {
  return withOwnedLearner<PlayableShelfItem | null>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(generatedActivity)
        .where(
          and(
            eq(generatedActivity.id, id),
            eq(generatedActivity.learnerId, learnerId),
            eq(generatedActivity.programSlug, programSlug),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        learnerId: row.learnerId,
        lessonId: row.lessonId,
        unitKey: row.unitKey,
        programSlug: row.programSlug,
        kind: row.kind as ActivityKind,
        title: row.title,
        config: row.config,
        skillTags: row.skillTags,
        gen: {
          model: row.genModel,
          route: row.genRoute,
          at: row.genAt.toISOString(),
        },
      };
    },
    null,
  );
}

/** Project a generated_activity row into the client-safe {@link ShelfItem}. */
function toShelfItem(r: typeof generatedActivity.$inferSelect): ShelfItem {
  return {
    id: r.id,
    lessonId: r.lessonId,
    unitKey: r.unitKey,
    kind: r.kind as ActivityKind,
    title: r.title,
    skillTags: r.skillTags,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Serialize a lesson's recount → generate → insert critical section behind a
 * per-(learner, program, unit, lesson) transaction-scoped advisory lock, so the
 * LLM spend is claimed BEFORE the model call (final review Fix 2). Without this, N concurrent
 * completions each pass a pre-lock cap check and each burn an LLM batch; the rows
 * stay capped (the in-tx recount + slice below does that), but the SPEND does
 * not. Here the lock is taken first, then the shelf is re-read INSIDE it: the
 * winner generates + inserts; every loser sees the winner's rows and returns them
 * WITHOUT calling `generate` (no model call). Mirrors the codebase's advisory-lock
 * precedent (scripts/migrate.ts's `pg_advisory_lock` around migrations).
 *
 * `generate(room)` runs INSIDE the tx (its LLM await holds the lock) and returns
 * the rows to persist; it is invoked only when there is room under the cap and the
 * shelf is not already satisfied. Holding the tx across the await is acceptable at
 * pilot scale: the lock scope is one learner's one lesson, so only self-races
 * contend. Tenancy is re-checked inside the tx (same pattern as recordAttempt) so
 * a foreign account writes nothing. Returns the full lesson shelf (existing +
 * freshly inserted), oldest-first.
 * @throws when the learner is not owned by the account (tenancy).
 */
export interface LessonGenerationScope {
  programSlug: string;
  unitKey: string;
  lessonId: string;
}

export async function withLessonGenerationLock(
  accountId: string,
  learnerId: string,
  scope: LessonGenerationScope,
  more: boolean,
  generate: (room: number) => Promise<NewGeneratedActivity[]>,
): Promise<ShelfItem[]> {
  return getDb().transaction(async (tx) => {
    // Lesson keys are unique only within their unit, and unit keys are scoped to
    // a program. Include every dimension so unrelated shelves never contend or
    // share a cap. The lock auto-releases at commit.
    const key = `${learnerId}:${scope.programSlug}:${scope.unitKey}:${scope.lessonId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

    // Tenancy boundary, re-checked inside the tx (same pattern as recordAttempt).
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
      .limit(1);
    if (!owned[0]) throw new Error("learner not found for account");

    // Re-read this lesson's shelf INSIDE the lock so the idempotency + cap
    // decisions (and the room passed to generate) race against the SAME snapshot
    // as the insert below — this is the recount that makes the spend claim atomic.
    const existingRows = await tx
      .select()
      .from(generatedActivity)
      .where(
        and(
          eq(generatedActivity.learnerId, learnerId),
          eq(generatedActivity.programSlug, scope.programSlug),
          eq(generatedActivity.unitKey, scope.unitKey),
          eq(generatedActivity.lessonId, scope.lessonId),
        ),
      )
      .orderBy(asc(generatedActivity.createdAt));
    const existing = existingRows.map(toShelfItem);

    // Idempotency + cap, now serialized: a filled shelf is returned as-is unless
    // `more`; a capped shelf never grows. A loser of the race lands here with the
    // winner's rows already present → returns them, `generate` never runs.
    if (!more && existing.length > 0) return existing;
    if (existing.length >= SHELF_LESSON_CAP) return existing;

    const room = Math.min(SHELF_BATCH, SHELF_LESSON_CAP - existing.length);
    const newRows = await generate(room);
    if (newRows.length === 0) return existing;

    // Re-cap against the same snapshot before inserting (defense-in-depth: never
    // exceed the room computed under the lock even if generate over-produced).
    const inserted = await tx
      .insert(generatedActivity)
      .values(
        newRows.slice(0, room).map((r) => ({
          learnerId,
          programSlug: r.programSlug,
          unitKey: r.unitKey,
          lessonId: r.lessonId,
          kind: r.kind,
          title: r.title,
          config: r.config,
          skillTags: r.skillTags,
          genModel: r.genModel,
          genRoute: r.genRoute,
          genAt: r.genAt,
        })),
      )
      .returning();
    return [...existing, ...inserted.map(toShelfItem)];
  });
}

/**
 * The learner's generated shelf for one program (owned-by-account), oldest-first
 * so the client renders a stable order. Completion is derived from attempts
 * client-side, so it is NOT stored on the shelf row.
 */
export async function listGeneratedShelf(
  accountId: string,
  learnerId: string,
  programSlug: string,
): Promise<ShelfItem[]> {
  return withOwnedLearner<ShelfItem[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(generatedActivity)
        .where(
          and(
            eq(generatedActivity.learnerId, learnerId),
            eq(generatedActivity.programSlug, programSlug),
          ),
        )
        .orderBy(asc(generatedActivity.createdAt));
      return rows.map(toShelfItem);
    },
    [],
  );
}

/**
 * One generated activity by id, ownership-checked (owned-by-account) AND scoped
 * to the learner so a foreign/mismatched id returns null. Carries the playable
 * `config` + `kind` (Task 4 renders/scores from it). Returns null when the
 * learner is not owned or the row doesn't exist / isn't this learner's.
 */
export async function getGeneratedActivity(
  accountId: string,
  learnerId: string,
  id: string,
): Promise<GeneratedActivityRow | null> {
  return withOwnedLearner<GeneratedActivityRow | null>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(generatedActivity)
        .where(and(eq(generatedActivity.id, id), eq(generatedActivity.learnerId, learnerId)))
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        lessonId: r.lessonId,
        unitKey: r.unitKey,
        programSlug: r.programSlug,
        kind: r.kind as ActivityKind,
        title: r.title,
        config: r.config,
        skillTags: r.skillTags,
        gen:
          r.genModel && r.genRoute && r.genAt
            ? { model: r.genModel, route: r.genRoute, at: r.genAt.toISOString() }
            : null,
      };
    },
    null,
  );
}

/** Outcome tally across a learner's skills (for the dashboard summary). */
export async function skillOutcomeCounts(
  accountId: string,
  learnerId: string,
  skills: SkillTag[],
): Promise<Record<SkillOutcome, number>> {
  const counts: Record<SkillOutcome, number> = { not_yet: 0, emerging: 0, solid: 0 };
  return withOwnedLearner<Record<SkillOutcome, number>>(
    accountId,
    learnerId,
    async () => {
      if (skills.length === 0) return counts;
      const rows = await getDb()
        .select({ skill: skillState.skill, outcome: skillState.outcome })
        .from(skillState)
        .where(and(eq(skillState.learnerId, learnerId), inArray(skillState.skill, skills)));
      const bySkill = new Map(rows.map((r) => [r.skill, r.outcome as SkillOutcome]));
      for (const s of skills) counts[bySkill.get(s) ?? "not_yet"] += 1;
      return counts;
    },
    counts,
  );
}

// ── Enrollment lifecycle + config + settings ─────────────────────────────────
//
// Write-time validation calls `<schema>.parse(...)` directly at each persistence
// site below. The action layer already validates caller input, but the store is
// the actual persistence boundary, so re-parsing here means malformed data can
// NEVER reach the column (defense-in-depth). Unlike the READ path — which fails
// CLOSED to `{ aiPractice: false }` via parseJsonbFailClosed because corrupt rows
// may already exist — a WRITE fails fast: a bad value throws {ZodError} and is
// never persisted.

/**
 * Upsert a program enrollment for the learner (owned-by-account check first).
 * Insert with status="active" and programVersionId when none exists; if one
 * already exists, restore to active and re-pin the version.
 * Returns false when the learner is not owned by the account (no write); true on
 * success — so the calling action can report not-found instead of a false ok.
 */
export async function assignProgram(
  accountId: string,
  learnerId: string,
  slug: string,
  programVersionId: string | null,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      // A fresh enrollment starts with an empty config; run it through the schema
      // so every config write in this store goes through one validation gate.
      const config = enrollmentConfigSchema.parse({});
      await getDb()
        .insert(enrollment)
        .values({
          learnerId,
          programSlug: slug,
          status: "active",
          config,
          programVersionId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [enrollment.learnerId, enrollment.programSlug],
          set: { status: "active", programVersionId, updatedAt: new Date() },
        });
      return true;
    },
    false,
  );
}

/**
 * Update the enrollment status for a learner's program (owned-by-account).
 * Enforces the transition guard: reads the current status first and no-ops if
 * the transition is not allowed (defense-in-depth against invalid state moves).
 * Returns false when the learner is not owned, no enrollment exists, or the
 * transition is disallowed (no row written); true when the status is updated.
 */
export async function setEnrollmentStatus(
  accountId: string,
  learnerId: string,
  slug: string,
  status: EnrollmentStatus,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      // Read the current row to enforce the transition matrix.
      const rows = await getDb()
        .select({ status: enrollment.status })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return false; // No enrollment row.

      const current = rows[0].status as EnrollmentStatus;
      if (!canTransitionStatus(current, status)) return false;

      await getDb()
        .update(enrollment)
        .set({ status, updatedAt: new Date() })
        .where(enrollmentKey(learnerId, slug));
      return true;
    },
    false,
  );
}

/**
 * Update the enrollment config for a learner's program (owned-by-account).
 * Returns false when the learner is not owned or no matching enrollment row
 * exists (no write); true when the config is updated.
 * @throws {ZodError} when `config` fails schema validation (never persisted).
 */
export async function setEnrollmentConfig(
  accountId: string,
  learnerId: string,
  slug: string,
  config: EnrollmentConfig,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      // Validate before persisting: a malformed config must never reach the column
      // (defense-in-depth behind the action-layer parse). @throws {ZodError}.
      const validated = enrollmentConfigSchema.parse(config);
      const updated = await getDb()
        .update(enrollment)
        .set({ config: validated, updatedAt: new Date() })
        .where(enrollmentKey(learnerId, slug))
        .returning({ id: enrollment.id });
      return updated.length > 0;
    },
    false,
  );
}

/**
 * All enrollments for the learner (owned-by-account), mapped to EnrollmentDetail.
 * Returns an empty array when the learner is not owned by the account.
 */
export async function listEnrollmentsDetailed(
  accountId: string,
  learnerId: string,
): Promise<EnrollmentDetail[]> {
  return withOwnedLearner<EnrollmentDetail[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(enrollment)
        .where(eq(enrollment.learnerId, learnerId));
      return rows.map((r) => ({
        slug: r.programSlug,
        status: r.status as EnrollmentStatus,
        config: r.config as EnrollmentConfig,
        programVersionId: r.programVersionId,
        startedAt: r.startedAt,
      }));
    },
    [],
  );
}

// The fail-closed defensive parse for both AI-gate jsonb columns lives in
// parseJsonbFailClosed (./jsonb): on a corrupt value it returns
// `{ aiPractice: false }` (block AI), never `{}` (allow). Each read below calls it
// with the column's schema and a descriptor that is logged as `malformed <ctx>`.

/**
 * Read the enrollment config for a specific (learner, program) pair (owned-by-account).
 * Returns {} when the learner is not owned by the account or no enrollment exists.
 * safeParses the stored jsonb so a malformed value can't fail-open the §8 gate
 * (a corrupt config fails CLOSED to `{ aiPractice: false }`, not `{}`).
 */
export async function getEnrollmentConfig(
  accountId: string,
  learnerId: string,
  slug: string,
): Promise<EnrollmentConfig> {
  return withOwnedLearner<EnrollmentConfig>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ config: enrollment.config })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return {};
      return parseJsonbFailClosed(
        enrollmentConfigSchema,
        rows[0].config,
        `enrollment config (learner=${learnerId} slug=${slug})`,
      );
    },
    {},
  );
}

/**
 * Read the enrollment's pinned program version for a (learner, program) pair
 * (owned-by-account). Returns:
 *   - `{ programVersionId }` when an enrollment row exists (the id may be null
 *     for a lazy/default enrollment that was never pinned to a specific version),
 *   - `null` when the learner is not owned OR no enrollment row exists.
 *
 * The learner surface uses this to honor the version pin: a learner pinned to an
 * older version keeps seeing THAT version's tree (and scopes progress to it) even
 * after a newer version is published. Status is intentionally NOT consulted here
 * — pinning is about WHICH tree to render; the §8 AI gate (getEnrollmentForGate)
 * separately enforces active-enrollment before any generation.
 */
export async function getEnrollmentVersionId(
  accountId: string,
  learnerId: string,
  slug: string,
): Promise<{ programVersionId: string | null } | null> {
  return withOwnedLearner<{ programVersionId: string | null } | null>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ programVersionId: enrollment.programVersionId })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return null;
      return { programVersionId: rows[0].programVersionId };
    },
    null,
  );
}

/**
 * §8 AI-gate read: the enrollment row's status + safeParsed config for a
 * (learner, program) pair (owned-by-account). Returns null when the learner is
 * not owned OR no enrollment row exists — both of which the gate treats as
 * fail-closed (no AI). A soft-removed enrollment returns status "removed" (not
 * resurrected), so the gate keeps blocking it.
 */
export async function getEnrollmentForGate(
  accountId: string,
  learnerId: string,
  slug: string,
): Promise<{ status: EnrollmentStatus; config: EnrollmentConfig } | null> {
  return withOwnedLearner<{ status: EnrollmentStatus; config: EnrollmentConfig } | null>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ status: enrollment.status, config: enrollment.config })
        .from(enrollment)
        .where(enrollmentKey(learnerId, slug))
        .limit(1);
      if (!rows[0]) return null;
      return {
        status: rows[0].status as EnrollmentStatus,
        config: parseJsonbFailClosed(
          enrollmentConfigSchema,
          rows[0].config,
          `enrollment config (gate learner=${learnerId} slug=${slug})`,
        ),
      };
    },
    null,
  );
}

/**
 * §8 AI-gate read: the per-learner settings (owned-by-account), safeParsed.
 * Returns null when the learner is not owned by the account;
 * `{ oralReading: false }` when the row has no/empty settings (AI stays
 * default-allow via absence, while the microphone gate's Zod default keeps it
 * opt-in); `{ aiPractice: false }` (fail-closed) when the stored settings are
 * malformed. The gate reads `settings?.aiPractice === false` as the top-level
 * (all-programs) parental kill-switch, and `settings?.oralReading === true` as
 * the explicit microphone opt-in.
 */
export async function getLearnerSettings(
  accountId: string,
  learnerId: string,
): Promise<LearnerSettings | null> {
  // One account-scoped select that ALSO reads the `settings` column (which the
  // LearnerRow projection doesn't carry) — so this stays inline rather than
  // going through withOwnedLearner (which would add a second ownership query).
  const rows = await getDb()
    .select({ settings: learner.settings })
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  if (!rows[0]) return null;
  return parseJsonbFailClosed(
    learnerSettingsSchema,
    rows[0].settings,
    `learner settings (gate learner=${learnerId})`,
  );
}

/**
 * Update the learner's settings (owned-by-account).
 * Returns false when the learner is not owned by the account (no write); true on
 * success. Scopes the write to (id, accountId) so the ownership check and the
 * update can't drift, and uses the affected-row count as the source of truth.
 * @throws {ZodError} when `settings` fails schema validation (never persisted).
 */
export async function saveLearnerSettings(
  accountId: string,
  learnerId: string,
  settings: LearnerSettings,
): Promise<boolean> {
  // Validate before persisting: malformed settings must never reach the column
  // (defense-in-depth behind the action-layer parse). @throws {ZodError}.
  const validated = learnerSettingsSchema.parse(settings);
  const updated = await getDb()
    .update(learner)
    .set({ settings: validated, updatedAt: new Date() })
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .returning({ id: learner.id });
  return updated.length > 0;
}

// ── Per-child data export + profile delete (spec §8) ─────────────────────────

/**
 * Gather the owned learner's full data and shape it into the minimized export
 * format (spec §8). Returns null when the learner does not exist or is not
 * owned by the account (tenancy boundary).
 *
 * The caller (action) stamps `exportedAt` so the pure shaper stays free of
 * `new Date()` and remains unit-testable without mocks.
 */
export async function buildLearnerExport(
  accountId: string,
  learnerId: string,
  exportedAt: string,
): Promise<LearnerExport | null> {
  // Ownership check that ALSO returns the FULL learner row (gatherLearnerExport
  // needs settings + every column) — so this stays inline rather than going
  // through withOwnedLearner, whose LearnerRow projection drops settings.
  const rows = await getDb()
    .select()
    .from(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .limit(1);
  if (!rows[0]) return null;
  return gatherLearnerExport(rows[0], exportedAt);
}

/**
 * Gather one OWNED learner row's full data and shape it into the minimized
 * export. Factored out so {@link buildLearnerExport} (single child) and
 * {@link buildAccountExport} (all children) share one gather + shape with no
 * duplicate ownership logic: the caller has ALREADY established the row belongs
 * to the account (via the scoped select / listLearners), so this takes the row
 * directly. Reads only; injects `exportedAt` so the pure shaper stays mock-free.
 */
async function gatherLearnerExport(
  learnerRow: typeof learner.$inferSelect,
  exportedAt: string,
): Promise<LearnerExport> {
  const learnerId = learnerRow.id;
  // Gather all related data in parallel (no write, just reads).
  const [
    enrollmentRows,
    skillStateRows,
    reviewScheduleRows,
    attemptRows,
    starBalanceRows,
    starLedgerRows,
    stickerRows,
    interestRows,
    questRows,
    checkpointResultRows,
    generatedActivityRows,
  ] = await Promise.all([
    getDb().select().from(enrollment).where(eq(enrollment.learnerId, learnerId)),
    getDb().select().from(skillState).where(eq(skillState.learnerId, learnerId)),
    getDb().select().from(reviewSchedule).where(eq(reviewSchedule.learnerId, learnerId)),
    getDb()
      .select()
      .from(attempt)
      .where(eq(attempt.learnerId, learnerId))
      .orderBy(desc(attempt.createdAt)),
    // Balance = sum over the WHOLE ledger (never bounded — the 500-row page
    // below is the export's ledger detail, not the total it sums to).
    getDb()
      .select({ total: sum(starLedger.delta) })
      .from(starLedger)
      .where(eq(starLedger.learnerId, learnerId)),
    getDb()
      .select()
      .from(starLedger)
      .where(eq(starLedger.learnerId, learnerId))
      .orderBy(desc(starLedger.createdAt))
      .limit(500),
    getDb().select().from(learnerSticker).where(eq(learnerSticker.learnerId, learnerId)),
    // Both source="parent" (offered) and source="child" (picked) rows — the
    // export is "all its data", not just the child's own picks.
    getDb()
      .select({ slug: interest.slug, source: learnerInterest.source })
      .from(learnerInterest)
      .innerJoin(interest, eq(learnerInterest.interestId, interest.id))
      .where(eq(learnerInterest.learnerId, learnerId)),
    getDb()
      .select()
      .from(learnerQuest)
      .where(eq(learnerQuest.learnerId, learnerId))
      // assignedOn is a `date` (day-granularity) column with legal same-day
      // ties, so ordering by it alone leaves rows at the 200-row boundary in a
      // non-deterministic order across exports (Postgres makes no promises among
      // ties). updatedAt (timestamptz) breaks the tie deterministically.
      .orderBy(desc(learnerQuest.assignedOn), desc(learnerQuest.updatedAt))
      .limit(200),
    // Adventure 2.0 C1 (Task 6): baseline/mid/final check-in results.
    getDb()
      .select()
      .from(checkpointResult)
      .where(eq(checkpointResult.learnerId, learnerId))
      .orderBy(desc(checkpointResult.createdAt)),
    // Adventure 2.0 B3 (Task 6): AI-generated practice items (the child's shelf).
    getDb()
      .select()
      .from(generatedActivity)
      .where(eq(generatedActivity.learnerId, learnerId))
      .orderBy(desc(generatedActivity.createdAt)),
  ]);

  return shapeLearnerExport({
    exportedAt,
    learner: {
      id: learnerRow.id,
      displayName: learnerRow.displayName,
      birthMonth: learnerRow.birthMonth,
      // learner.settings / enrollment.config are jsonb `$type<...>()` columns, so
      // Drizzle already infers the right type here — no cast needed.
      settings: learnerRow.settings,
    },
    enrollments: enrollmentRows.map((e) => ({
      programSlug: e.programSlug,
      status: e.status,
      config: e.config,
    })),
    skillState: skillStateRows.map((s) => ({
      skill: s.skill,
      outcome: s.outcome,
      evidence: (s.evidence as { day: string; outcome: string }[]) ?? [],
    })),
    reviewSchedules: reviewScheduleRows.map((schedule) => ({
      skill: schedule.skill,
      programSlug: schedule.programSlug,
      intervalIndex: schedule.intervalIndex,
      nextReviewOn: schedule.nextReviewOn,
      lastReviewedOn: schedule.lastReviewedOn,
      lastOutcome: schedule.lastOutcome,
    })),
    attempts: attemptRows.map((a) => ({
      activityId: a.activityId,
      kind: a.kind,
      score: a.score as { stars: number; correct: number; total: number; skillEvidence: unknown[] },
      // The child's own response (journal text, drawings, answers) — exported in
      // full for COPPA "export … all its data" (shaped in export.ts).
      response: a.response,
      day: a.day,
      createdAt: a.createdAt,
      // Provenance (P6): carried for generated rows so the export includes the
      // "what the AI made" trail. The shaper filters to generated attempts.
      generated: a.generated,
      genModel: a.genModel,
      genRoute: a.genRoute,
      genAt: a.genAt,
    })),
    stars: {
      balance: Number(starBalanceRows[0]?.total ?? 0),
      ledger: starLedgerRows.map((r) => ({
        delta: r.delta,
        reason: r.reason,
        refId: r.refId,
        createdAt: r.createdAt,
      })),
    },
    stickers: stickerRows.map((s) => ({ stickerId: s.stickerId, acquiredAt: s.acquiredAt })),
    interests: interestRows.map((i) => ({ slug: i.slug, source: i.source })),
    quests: questRows.map((q) => ({
      title: q.title,
      status: q.status,
      assignedOn: q.assignedOn,
    })),
    checkpointResults: checkpointResultRows.map((r) => ({
      unitId: r.unitId,
      phase: r.phase,
      scores: r.scores,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    generatedActivities: generatedActivityRows.map((g) => ({
      unitKey: g.unitKey,
      lessonId: g.lessonId,
      kind: g.kind,
      title: g.title,
      config: g.config,
      skillTags: g.skillTags,
      genModel: g.genModel,
      genRoute: g.genRoute,
      genAt: g.genAt.toISOString(),
      createdAt: g.createdAt.toISOString(),
    })),
  });
}

/**
 * Build the WHOLE-ACCOUNT export (P6 / spec §8 "export … all its data"): the
 * parent record (minimized — id/email/createdAt, NEVER password/tokens) plus
 * every learner the account owns, each shaped by the same per-child gatherer
 * (so provenance + minimization land once). Account-scoped: only this account's
 * learners are included. The caller (action) injects `exportedAt`.
 *
 * Returns null when the parent `user` row can't be found (e.g. the account was
 * deleted mid-request) — the action turns that into a calm "unavailable".
 */
export async function buildAccountExport(
  accountId: string,
  exportedAt: string,
): Promise<AccountExport | null> {
  // The parent record — minimized. Read ONLY the non-sensitive columns; the
  // password/token columns live on the Better Auth `account` table, never here,
  // but we still select explicitly so a future `user` column can't leak by
  // default into the export.
  const userRows = await getDb()
    .select({ id: user.id, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, accountId))
    .limit(1);
  if (!userRows[0]) return null;
  const account = {
    id: userRows[0].id,
    email: userRows[0].email,
    createdAt: userRows[0].createdAt.toISOString(),
  };

  // Every learner the account owns (listLearners is already account-scoped, so
  // this is the per-account ownership check — no second check per learner).
  const learnerRows = await getDb()
    .select()
    .from(learner)
    .where(eq(learner.accountId, accountId))
    .orderBy(learner.createdAt);
  const learners = await Promise.all(
    learnerRows.map((row) => gatherLearnerExport(row, exportedAt)),
  );

  return shapeAccountExport({ exportedAt, account, learners });
}

/**
 * Delete a child profile (and all its data via cascade). Returns true if the
 * learner was found and deleted, false if not owned or not found (tenancy boundary).
 *
 * FK cascade: `enrollment`, `attempt`, `skill_state`, `star_ledger`,
 * `learner_sticker`, `learner_interest`, `learner_quest`, and `checkpoint_result`
 * all have `onDelete: "cascade"` on `learner.id`, so deleting the learner row
 * removes everything. No orphan cleanup needed.
 */
export async function deleteLearner(
  accountId: string,
  learnerId: string,
): Promise<boolean> {
  const deleted = await getDb()
    .delete(learner)
    .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
    .returning({ id: learner.id });
  return deleted.length > 0;
}

/** What {@link deleteAccount} did, for the confirmation screen / action result. */
export interface DeleteAccountResultData {
  /** False when no `user` row matched the id (already gone) — nothing deleted. */
  deleted: boolean;
  deletedLearners: number;
  deletedAttempts: number;
}

/**
 * Hard-delete the WHOLE account: the parent `user` row and everything that
 * cascades off it (P6 / spec §8 "delete … all its data"). One
 * `DELETE FROM "user" WHERE id = ?` does the work via Postgres FKs:
 *
 *   user ─┬─ learner          (cascade) ─→ enrollment, attempt, skill_state (cascade)
 *         │                              ─→ star_ledger, learner_sticker, learner_interest,
 *         │                                 learner_quest (cascade — Adventure 2.0 Phase A)
 *         ├─ session          (cascade, auth-schema)
 *         └─ account          (cascade, auth-schema — Better Auth credentials/oauth)
 *   publisher.ownerUserId      (set null) — a published program does NOT vanish when
 *                                           its author closes their account; ownership nulls
 *
 * A {@link deletionAudit} row is written FIRST, inside the same transaction, so
 * the audit (which has NO FK to `user`) survives the cascade it records. Counts
 * are snapshot before the delete for that record + the confirmation screen.
 *
 * Hard delete by design (consistent with deleteLearner + the "delete … always"
 * promise; a soft-delete would leave child data after a parent asked to remove
 * it — arguably worse for COPPA). Audio is intentionally untouched: clips are
 * shared + content-addressed + reference no learner/account (no PII).
 */
export async function deleteAccount(accountId: string): Promise<DeleteAccountResultData> {
  return getDb().transaction(async (tx) => {
    // Snapshot counts for the audit + confirmation (cheap; before the cascade).
    const [learnerCountRow] = await tx
      .select({ value: count() })
      .from(learner)
      .where(eq(learner.accountId, accountId));
    const learnerCount = learnerCountRow?.value ?? 0;

    // attempt has no account_id; scope its count through the account's learners.
    const learnerIdRows = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(eq(learner.accountId, accountId));
    const learnerIds = learnerIdRows.map((r) => r.id);
    let attemptCount = 0;
    if (learnerIds.length > 0) {
      const [attemptCountRow] = await tx
        .select({ value: count() })
        .from(attempt)
        .where(inArray(attempt.learnerId, learnerIds));
      attemptCount = attemptCountRow?.value ?? 0;
    }

    // Audit FIRST (no FK to user → survives the cascade below).
    await tx.insert(deletionAudit).values({
      userId: accountId,
      learnerCount,
      attemptCount,
      requestedBy: "parent",
    });

    // Better Auth's `verification` table has NO FK to user, so the user-delete
    // cascade below MISSES it. Delete this parent's verification rows (keyed by the
    // email identifier — Better Auth's email-verify/password-reset tokens are keyed
    // by email) so account deletion truly removes ALL auth artifacts (COPPA "delete
    // … all its data"). Usually empty today (email verification is off, P4 Stage 2),
    // but correct + future-proof once reset/verify flows populate it.
    const [u] = await tx
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, accountId))
      .limit(1);
    if (u?.email) {
      // Cover BOTH key shapes Better Auth uses: email-verification rows keyed by
      // `identifier = email`, AND password-reset / delete-account tokens keyed by
      // `identifier = "<flow>:<token>"` with `value = user.id`. Match either so no
      // auth artifact survives.
      await tx
        .delete(verification)
        .where(or(eq(verification.identifier, u.email), eq(verification.value, accountId)));
    }

    // The single delete the whole cascade hangs off.
    const deletedUsers = await tx
      .delete(user)
      .where(eq(user.id, accountId))
      .returning({ id: user.id });

    return {
      deleted: deletedUsers.length > 0,
      deletedLearners: learnerCount,
      deletedAttempts: attemptCount,
    };
  });
}
