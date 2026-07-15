import { sql } from "drizzle-orm";
import { getDb } from "./index";

export type ColumnMap = Record<string, string[]>;

export const REQUIRED_COLUMNS: ColumnMap = {
  health_check: ["id", "note", "checked_at"],
  // Tutor data model (must be migrated before the app expects it). Lists the
  // NOT-NULL / actively-queried columns of each table; a real schema drift on
  // any of these should trip the 503 canary, so undercoverage here is a bug.
  learner: [
    "id",
    "account_id",
    "display_name",
    "avatar",
    "birth_month",
    "settings",
    "created_at",
    "updated_at",
  ],
  enrollment: ["id", "learner_id", "program_slug", "status", "started_at", "config", "program_version_id", "updated_at"],
  attempt: [
    "id",
    "learner_id",
    "activity_id",
    "kind",
    "program_slug",
    "unit_key",
    "program_version_id",
    "completion_id",
    "generated",
    "score",
    "response",
    "day",
    "created_at",
    // AI-provenance (P6, migration 0008). Nullable, but `recordAttempt` now writes
    // them on EVERY insert, so a deploy that skipped 0008 must 503 here rather than
    // fail every attempt-record at runtime.
    "gen_model",
    "gen_route",
    "gen_at",
  ],
  // Privacy-safe oral verification witness (migration 0015). Both the upload
  // route and the atomic completion claim depend on every listed column.
  oral_reading_verification: [
    "id",
    "learner_id",
    "program_slug",
    "program_version_id",
    "unit_key",
    "activity_id",
    "mode",
    "result",
    "per_word",
    "correct_count",
    "total_words",
    "wcpm",
    "expires_at",
    "consumed_completion_id",
    "created_at",
  ],
  skill_state: ["id", "learner_id", "skill", "outcome", "evidence", "updated_at"],
  // Phase 3 spaced repetition (migration 0012). Every scheduler write/read
  // depends on this concern table, so drift must fail the canary first.
  review_schedule: [
    "id",
    "learner_id",
    "skill",
    "program_slug",
    "interval_index",
    "next_review_on",
    "last_reviewed_on",
    "last_outcome",
    "updated_at",
  ],
  // Account-deletion audit (P6, migration 0008). Written by deleteAccount before the
  // cascade; gate it so a skipped 0008 fails closed rather than 500-ing a delete.
  deletion_audit: ["id", "user_id", "deleted_at", "learner_count", "attempt_count", "requested_by"],
  // Better Auth tables (auth-schema.ts) — drift here breaks login silently.
  // `role` (P4) gates admin access; a deploy that skipped the 0007 migration must
  // 503 rather than let requireAdmin() read a non-existent column and 500.
  user: ["id", "email", "email_verified", "role"],
  session: ["id", "user_id", "token", "expires_at"],
  account: ["id", "user_id", "provider_id", "account_id"],
  verification: ["id", "identifier", "value", "expires_at"],
  // Optional parent-area PIN gate (migration 0013). A missing table must fail
  // the canary before the parent layout attempts its per-request gate read.
  parent_pin: ["account_id", "pin_hash", "failed_attempts", "locked_until", "updated_at"],
  // Curriculum marketplace tables (Slice 1). Drift on any of these 503s the
  // deploy canary before the app tries to read versioned content.
  publisher: ["id", "name", "kind"],
  program: ["id", "slug", "status"],
  program_version: ["id", "program_id", "version", "status", "title"],
  unit: ["id", "program_version_id", "unit_key", "order_key", "title"],
  lesson: ["id", "unit_id", "lesson_key", "order_key", "title"],
  activity: ["id", "lesson_id", "activity_key", "order_key", "kind", "title", "config"],
  skill: ["id", "slug", "domain", "label"],
  // Adventure 2.0 Phase C1 baseline placement (migration 0010). Drift here
  // must 503 before checkpoint capture reads/writes a missing column.
  checkpoint_result: [
    "id",
    "learner_id",
    "enrollment_id",
    "unit_id",
    "phase",
    "scores",
    "status",
    "created_at",
    "applied_at",
  ],
  // Adventure 2.0 B3 adaptive-generation shelf (spec §4). Drift here must 503
  // before the generation loop reads/writes a missing column.
  generated_activity: [
    "id",
    "learner_id",
    "program_slug",
    "program_version_id",
    "unit_key",
    "lesson_id",
    "kind",
    "title",
    "config",
    "skill_tags",
    "gen_model",
    "gen_route",
    "gen_at",
    "created_at",
  ],
};

export function missingColumns(required: ColumnMap, live: ColumnMap): string[] {
  const missing: string[] = [];
  for (const [table, cols] of Object.entries(required)) {
    const liveCols = new Set(live[table] ?? []);
    for (const col of cols) if (!liveCols.has(col)) missing.push(`${table}.${col}`);
  }
  return missing;
}

export async function liveColumns(): Promise<ColumnMap> {
  const rows = await getDb().execute<{ table_name: string; column_name: string }>(
    sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const map: ColumnMap = {};
  // RowList<Row[]> is the array directly (postgres-js driver returns rows as the result itself)
  for (const r of rows) (map[r.table_name] ??= []).push(r.column_name);
  return map;
}
