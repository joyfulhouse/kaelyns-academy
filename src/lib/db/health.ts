import { sql } from "drizzle-orm";
import { getDb } from "./index";

export type ColumnMap = Record<string, string[]>;

export const REQUIRED_COLUMNS: ColumnMap = {
  health_check: ["id", "note", "checked_at"],
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
