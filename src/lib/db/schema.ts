import { pgTable, serial, timestamp, text, jsonb, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const healthCheck = pgTable("health_check", {
  id: serial("id").primaryKey(),
  note: text("note").notNull().default("ok"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tutor data model (spec §5/§7). An "account" is the Better Auth `user` (one
 * parent). A learner is a child profile under that account; attempts and
 * skill_state are scoped to a learner. Child PII is minimized to a display name
 * + birth month (spec §8). IDs are app-generated UUIDs (text).
 */

const uuid = () => globalThis.crypto.randomUUID();

export const learner = pgTable("learner", {
  id: text("id").primaryKey().$defaultFn(uuid),
  accountId: text("account_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  /** Birth MONTH only (e.g. "August"), never a full birth date. */
  birthMonth: text("birth_month"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  (t) => [index("attempt_learner_created_idx").on(t.learnerId, t.createdAt)],
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
  (t) => [uniqueIndex("skill_state_learner_skill_uq").on(t.learnerId, t.skill)],
);

export * from "./auth-schema";
