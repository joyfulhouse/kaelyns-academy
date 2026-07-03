import { pgTable, serial, timestamp, text, jsonb, date, boolean, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import type { EnrollmentConfig, LearnerSettings } from "@/lib/content/config";
import type { QuestProgress, QuestTarget } from "@/lib/quests/config";

const uuid = () => globalThis.crypto.randomUUID();

export const healthCheck = pgTable("health_check", {
  id: serial("id").primaryKey(),
  note: text("note").notNull().default("ok"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Curriculum marketplace tables ────────────────────────────────────────────
// Global (not account-scoped). Slice 1 adds the structure; Slice 2 wires the
// app to read from these instead of the static content module.

export const publisher = pgTable("publisher", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("builtin"), // builtin | admin | third_party
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("publisher_owner_user_idx").on(t.ownerUserId)]);

export const program = pgTable("program", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  publisherId: text("publisher_id").references(() => publisher.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft | published | archived
  publishedVersionId: text("published_version_id"), // loose ref (no FK) → program_version.id; avoids a circular constraint
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("program_publisher_idx").on(t.publisherId)]);

export const programVersion = pgTable("program_version", {
  id: text("id").primaryKey().$defaultFn(uuid),
  programId: text("program_id").notNull().references(() => program.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"), // draft | published | archived
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  ageBand: text("age_band"),
  summary: text("summary"),
  world: text("world"),
  locale: text("locale"),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("program_version_program_version_uq").on(t.programId, t.version)]);

export const unit = pgTable("unit", {
  id: text("id").primaryKey().$defaultFn(uuid),
  programVersionId: text("program_version_id").notNull().references(() => programVersion.id, { onDelete: "cascade" }),
  unitKey: text("unit_key").notNull(),
  orderKey: text("order_key").notNull(),
  title: text("title").notNull(),
  emoji: text("emoji"),
  world: text("world").notNull().default("sunshine"),
  bigIdea: text("big_idea"),
  phonicsFocus: text("phonics_focus"),
  mathFocus: text("math_focus"),
  project: text("project"),
  checkpoint: text("checkpoint"),
  /** Adventure 2.0 branching: consecutive units sharing a non-null branchKey
   *  render as parallel map paths (spec §3.6). Null = the single main path. */
  branchKey: text("branch_key"),
}, (t) => [uniqueIndex("unit_pv_key_uq").on(t.programVersionId, t.unitKey)]);

export const lesson = pgTable("lesson", {
  id: text("id").primaryKey().$defaultFn(uuid),
  unitId: text("unit_id").notNull().references(() => unit.id, { onDelete: "cascade" }),
  lessonKey: text("lesson_key").notNull(),
  orderKey: text("order_key").notNull(),
  title: text("title").notNull(),
}, (t) => [uniqueIndex("lesson_unit_key_uq").on(t.unitId, t.lessonKey)]);

export const activity = pgTable("activity", {
  id: text("id").primaryKey().$defaultFn(uuid),
  lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
  activityKey: text("activity_key").notNull(),
  orderKey: text("order_key").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  blurb: text("blurb"),
  estMinutes: integer("est_minutes"),
  band: text("band").notNull().default("ready"),
  skillTags: jsonb("skill_tags").$type<string[]>().notNull().default([]),
  standardTags: jsonb("standard_tags").$type<string[]>().notNull().default([]),
  config: jsonb("config").$type<unknown>().notNull(),
}, (t) => [uniqueIndex("activity_lesson_key_uq").on(t.lessonId, t.activityKey)]);

export const skill = pgTable("skill", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  domain: text("domain").notNull(),
  label: text("label").notNull(),
  readyIndicator: text("ready_indicator").notNull(),
  stretchIndicator: text("stretch_indicator"),
});

/**
 * Tutor data model (spec §5/§7). An "account" is the Better Auth `user` (one
 * parent). A learner is a child profile under that account; attempts and
 * skill_state are scoped to a learner. Child PII is minimized to a display name
 * + birth month (spec §8). IDs are app-generated UUIDs (text).
 */

export const learner = pgTable(
  "learner",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    avatar: text("avatar"),
    /** Birth MONTH only (e.g. "August"), never a full birth date. */
    birthMonth: text("birth_month"),
    settings: jsonb("settings").$type<LearnerSettings>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Every learner lookup is account-scoped (listLearners, the tenancy checks in
  // getLearner/saveLearnerSettings/deleteLearner). Index the FK so those scans
  // don't fall back to a seq scan as accounts accumulate.
  (t) => [index("learner_account_idx").on(t.accountId)],
);

export const enrollment = pgTable(
  "enrollment",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    programSlug: text("program_slug").notNull(),
    status: text("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    programVersionId: text("program_version_id").references(() => programVersion.id, { onDelete: "set null" }),
    config: jsonb("config").$type<EnrollmentConfig>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("enrollment_learner_program_uq").on(t.learnerId, t.programSlug)],
);

export const attempt = pgTable(
  "attempt",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),
    kind: text("kind").notNull(),
    /** true when the activity was AI-generated practice (not authored content). */
    generated: boolean("generated").notNull().default(false),
    // ── AI provenance (P6 / spec §8 "what the AI made" trail) ────────────────
    // Populated only for generated=true rows; authored rows leave these null.
    // Metadata ONLY — never the raw prompt (a prompt can embed the child's
    // display name → PII; see plan §3.3 / open question Q3). All nullable +
    // expand-only, so old generated rows simply show "model not recorded".
    /** Logical tutor route name from models.ts (e.g. "ha-assist") — NOT a raw provider model id. */
    genModel: text("gen_model"),
    /** Audit tag for the generation path (band like "ready"/"stretch", or a language id). */
    genRoute: text("gen_route"),
    /** When generation happened (may differ from createdAt, which is when the attempt was recorded). */
    genAt: timestamp("gen_at", { withTimezone: true }),
    score: jsonb("score")
      .$type<{
        correct: number;
        total: number;
        stars: number;
        skillEvidence: { skill: string; outcome: string }[];
      }>()
      .notNull(),
    response: jsonb("response").$type<unknown>(),
    /** Calendar day (YYYY-MM-DD) the attempt happened — the mastery gate keys on it. */
    day: date("day").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attempt_learner_created_idx").on(t.learnerId, t.createdAt),
    // getCompletedActivityIds filters attempts by (learnerId, generated=false);
    // this composite lets that authored-only scan use an index instead of
    // filtering every attempt row for the learner.
    index("attempt_learner_generated_idx").on(t.learnerId, t.generated),
  ],
);

export const skillState = pgTable(
  "skill_state",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    skill: text("skill").notNull(),
    /** not_yet | emerging | solid (derived by the mastery engine). */
    outcome: text("outcome").notNull().default("not_yet"),
    /** Per-attempt outcome history stamped by day; the gate derives `outcome`. */
    evidence: jsonb("evidence")
      .$type<{ day: string; outcome: string; source?: "play" | "baseline" }[]>()
      .notNull()
      .default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_state_learner_skill_uq").on(t.learnerId, t.skill),
    // getSkillState / buildLearnerExport read all of a learner's skill rows
    // (no skill predicate), which the (learnerId, skill) unique index serves
    // only by prefix; a dedicated learnerId index keeps that whole-learner read
    // index-backed.
    index("skill_state_learner_idx").on(t.learnerId),
  ],
);

/**
 * Assessment capture (Adventure 2.0 Phase C, spec §3.5). One row per
 * (learner, checkpoint unit, phase) — the per-skill first-try signal from a
 * baseline/mid/final check-in. Baseline attempts fold here INSTEAD of
 * skill_state (nothing changes about the learner's level until a parent applies
 * the placement). `status` tracks the parent gate: pending → applied | dismissed.
 */
export const checkpointResult = pgTable(
  "checkpoint_result",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    /** The authored checkpoint unit's stable id (e.g. "reading-baseline"). */
    unitId: text("unit_id").notNull(),
    /** baseline | mid | final. C1 only writes "baseline". */
    phase: text("phase").notNull(),
    /** Per-skill first-try rate 0..1, keyed by skill slug. */
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    /** pending | applied | dismissed — the parent-confirmation gate. */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [
    // One live result per (learner, checkpoint unit, phase); Redo deletes the
    // row so the check-in can be re-taken.
    uniqueIndex("checkpoint_result_learner_unit_phase_uq").on(t.learnerId, t.unitId, t.phase),
    index("checkpoint_result_learner_idx").on(t.learnerId),
  ],
);

/**
 * Account-deletion audit (P6 / spec §8 retention). One row is written
 * immediately BEFORE an account's hard delete cascades, recording who/when and
 * the counts that were removed.
 *
 * Deliberately has NO foreign key to `user`: the row it records is the deletion
 * of that very user, so an FK with cascade would delete the audit along with it.
 * `userId` is therefore a plain text column (the id of the now-deleted account),
 * letting the audit survive the cascade. Holds no child PII — only counts.
 */
export const deletionAudit = pgTable(
  "deletion_audit",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    /** The deleted account's user id. NOT an FK (must outlive the user it records). */
    userId: text("user_id").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    learnerCount: integer("learner_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    /** Who requested the deletion (e.g. "parent"); future: "admin"/"automation". */
    requestedBy: text("requested_by").notNull().default("parent"),
  },
  (t) => [index("deletion_audit_user_idx").on(t.userId)],
);

// ── Adventure 2.0 Phase A: motivation + choice (spec §3) ─────────────────────

/**
 * Append-only star economy (spec §3.1). Balance = sum(delta); no mutable
 * counter to corrupt. Earns are written inside recordAttempt's transaction;
 * spends inside purchaseSticker's transaction (atomic with the grant).
 */
export const starLedger = pgTable(
  "star_ledger",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    /** activity_complete | quest_complete | sticker_purchase | adjustment */
    reason: text("reason").notNull(),
    /** Polymorphic reference (activityId / learnerQuest.id / sticker.id). */
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("star_ledger_learner_created_idx").on(t.learnerId, t.createdAt)],
);

export const stickerPack = pgTable("sticker_pack", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  theme: text("theme"),
  /** draft | published | archived (status lifecycle, NOT version-cloned — spec §2). */
  status: text("status").notNull().default("draft"),
  sortKey: text("sort_key").notNull().default("a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sticker = pgTable(
  "sticker",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    packId: text("pack_id")
      .notNull()
      .references(() => stickerPack.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** v1 format "emoji:🦄" (rendered as a big emoji tile); future "asset:/stickers/…". */
    artRef: text("art_ref").notNull(),
    starCost: integer("star_cost").notNull(),
    sortKey: text("sort_key").notNull().default("a"),
  },
  (t) => [uniqueIndex("sticker_pack_slug_uq").on(t.packId, t.slug)],
);

export const learnerSticker = pgTable(
  "learner_sticker",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    stickerId: text("sticker_id")
      .notNull()
      .references(() => sticker.id, { onDelete: "cascade" }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learner_sticker_uq").on(t.learnerId, t.stickerId)],
);

/** Admin-authored preset interest taxonomy (spec §3.3). Bounded vocabulary —
 *  the ONLY interest strings that can ever reach an AI prompt (§8). */
export const interest = pgTable("interest", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  /** A single emoji. */
  icon: text("icon"),
  status: text("status").notNull().default("published"),
});

/**
 * Two row kinds per (learner, interest): source="parent" = the parent OFFERS
 * this chip to the picker; source="child" = the child PICKED it. Child picks
 * are validated ⊆ the offered set (spec §4.3).
 */
export const learnerInterest = pgTable(
  "learner_interest",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    interestId: text("interest_id")
      .notNull()
      .references(() => interest.id, { onDelete: "cascade" }),
    /** parent (offered) | child (picked) */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learner_interest_uq").on(t.learnerId, t.interestId, t.source)],
);

export const questTemplate = pgTable("quest_template", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  /** May contain the "{focus}" placeholder, resolved at assignment (unit/skill name). */
  title: text("title").notNull(),
  /** complete_n | try_strand | practice_skill (v1; Phase C adds reach_checkpoint). */
  kind: text("kind").notNull(),
  params: jsonb("params").$type<unknown>().notNull().default({}),
  rewardStars: integer("reward_stars").notNull().default(3),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One offered/active/done quest for one learner on one day (spec §3.4).
 * kind/title/target/rewardStars are DENORMALIZED from the template at
 * assignment so a template edit never mutates an in-flight day (same
 * philosophy as enrollment version-pinning).
 */
export const learnerQuest = pgTable(
  "learner_quest",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => questTemplate.id, { onDelete: "cascade" }),
    programSlug: text("program_slug").notNull(),
    /** Calendar day (YYYY-MM-DD, server clock) the quest belongs to. */
    assignedOn: date("assigned_on").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    target: jsonb("target").$type<QuestTarget>().notNull(),
    progress: jsonb("progress").$type<QuestProgress>().notNull(),
    rewardStars: integer("reward_stars").notNull(),
    /** offered | active | done. Yesterday's rows simply aren't today's (no "expired"). */
    status: text("status").notNull().default("offered"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("learner_quest_learner_day_idx").on(t.learnerId, t.assignedOn),
    // Idempotent daily generation: two racing requests insert the same drafts
    // with onConflictDoNothing keyed here, then re-read.
    uniqueIndex("learner_quest_day_template_uq").on(
      t.learnerId,
      t.programSlug,
      t.assignedOn,
      t.templateId,
    ),
  ],
);

export * from "./auth-schema";
