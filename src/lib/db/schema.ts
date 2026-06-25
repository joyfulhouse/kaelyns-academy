import { pgTable, serial, timestamp, text, jsonb, date, boolean, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import type { EnrollmentConfig, LearnerSettings } from "@/lib/content/config";

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
});

export const program = pgTable("program", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  publisherId: text("publisher_id").references(() => publisher.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft | published | archived
  publishedVersionId: text("published_version_id"), // loose ref (no FK) → program_version.id; avoids a circular constraint
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
      .$type<{ day: string; outcome: string }[]>()
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

export * from "./auth-schema";
