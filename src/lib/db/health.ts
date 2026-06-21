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
    "generated",
    "score",
    "response",
    "day",
    "created_at",
  ],
  skill_state: ["id", "learner_id", "skill", "outcome", "evidence", "updated_at"],
  // Better Auth tables (auth-schema.ts) — drift here breaks login silently.
  user: ["id", "email", "email_verified"],
  session: ["id", "user_id", "token", "expires_at"],
  account: ["id", "user_id", "provider_id", "account_id"],
  verification: ["id", "identifier", "value", "expires_at"],
  // Curriculum marketplace tables (Slice 1). Drift on any of these 503s the
  // deploy canary before the app tries to read versioned content.
  publisher: ["id", "name", "kind"],
  program: ["id", "slug", "status"],
  program_version: ["id", "program_id", "version", "status", "title"],
  unit: ["id", "program_version_id", "unit_key", "order_key", "title"],
  lesson: ["id", "unit_id", "lesson_key", "order_key", "title"],
  activity: ["id", "lesson_id", "activity_key", "order_key", "kind", "title", "config"],
  skill: ["id", "slug", "domain", "label"],
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
