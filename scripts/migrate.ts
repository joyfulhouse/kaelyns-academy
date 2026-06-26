/**
 * Apply pending Drizzle migrations against $DATABASE_URL, then exit.
 *
 * Used by the k3s-infra ArgoCD PreSync Job (and runnable locally). This replaces
 * `drizzle-kit migrate` for deploys: the drizzle-kit CLI's exit code is flaky in a
 * non-TTY pod — its progress spinner can crash the process with exit 1 *after* the
 * migration has already committed, which would intermittently fail (and therefore
 * block) every deploy. drizzle-orm's migrate() runs the SAME journal logic with a
 * deterministic exit code and an explicit connection close, so it is safe to gate a
 * rollout on. Idempotent: already-applied migrations (tracked in
 * drizzle.__drizzle_migrations) are skipped.
 *
 * Fails CLOSED on an unbaselined database (see assertBaselined): the live
 * `kaelyns-academy-db` was bootstrapped with `drizzle-kit push`, so its
 * `drizzle.__drizzle_migrations` journal is EMPTY (or could be partially
 * backfilled) while the tables already exist. Running migrate() blindly there
 * would treat the bootstrap migrations as pending and abort recreating existing
 * tables — bricking the deploy. The preflight refuses any journal not caught up
 * past the replay-unsafe bootstrap migrations with an actionable error, so this
 * runner is safe to wire into the k3s-infra PreSync Job. The journal must first
 * be backfilled with ALL already-applied tags (one-time ops step); until then,
 * apply new expand-only migrations the current way:
 * `scripts/db.sh < drizzle/<file>.sql`.
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const MIGRATIONS_FOLDER = "drizzle";

interface JournalEntry {
  tag: string;
  when: number;
}

/**
 * The `folderMillis` (journal `when`) of the LAST replay-unsafe migration, or 0
 * if every migration is replay-safe. Drizzle's Postgres migrator decides what is
 * pending by comparing each migration's `folderMillis` against the newest
 * `created_at` in drizzle.__drizzle_migrations, so a journal whose latest row is
 * older than this threshold would cause migrate() to replay a migration that
 * creates an already-existing object. "Replay-unsafe" = the SQL has a bare
 * `CREATE TABLE`/`CREATE …` without `IF NOT EXISTS` (the 0000–0003 bootstrap);
 * the 0004+ index migrations all use `IF NOT EXISTS` and are safe to re-run.
 * Derived from the journal + SQL files so it tracks the actual history, not a
 * hardcoded tag.
 */
function lastUnsafeMigrationMillis(): number {
  const journal = JSON.parse(
    readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
  ) as { entries: JournalEntry[] };
  let threshold = 0;
  for (const entry of journal.entries) {
    const ddl = readFileSync(`${MIGRATIONS_FOLDER}/${entry.tag}.sql`, "utf8");
    // Check each statement (drizzle splits on this marker): a statement that
    // creates an object without IF NOT EXISTS cannot be safely replayed against a
    // database that already has that object.
    const unsafe = ddl
      .split("--> statement-breakpoint")
      .some((stmt) => /\bCREATE\b/i.test(stmt) && !/\bIF\s+NOT\s+EXISTS\b/i.test(stmt));
    if (unsafe && entry.when > threshold) {
      threshold = entry.when;
    }
  }
  return threshold;
}

/**
 * Refuse to run against a database whose schema already exists but whose Drizzle
 * journal is not caught up past the replay-unsafe bootstrap migrations. The live
 * `kaelyns-academy-db` was bootstrapped with `drizzle-kit push`, so its journal
 * is EMPTY while the tables already exist; a blind migrate() would treat 0000+
 * as pending and abort recreating existing objects — a duplicate-object error
 * that blocks (and retry-loops) the rollout. A *partial* manual baseline (only
 * some bootstrap rows inserted) hits the same trap, so the guard checks the
 * journal's latest timestamp, not merely that it is non-empty. A genuinely empty
 * database (no app tables) is the normal first-run case and is allowed.
 */
async function assertBaselined(sql: Sql): Promise<void> {
  // Both reads are existence-safe: information_schema and to_regclass never error
  // on a missing object (to_regclass returns NULL), so referencing the journal
  // table indirectly avoids a parse-time failure when it doesn't exist yet.
  const [{ app_tables, journal_exists }] = await sql<
    { app_tables: number; journal_exists: boolean }[]
  >`
    SELECT
      (SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE')::int AS app_tables,
      (to_regclass('drizzle.__drizzle_migrations') IS NOT NULL) AS journal_exists
  `;
  if (app_tables === 0) return; // fresh database → normal first run, nothing to baseline

  const threshold = lastUnsafeMigrationMillis();
  const latestApplied = journal_exists
    ? Number(
        (
          await sql<{ created_at: string | null }[]>`
            SELECT max(created_at)::text AS created_at FROM drizzle.__drizzle_migrations
          `
        )[0].created_at ?? 0,
      )
    : 0;
  if (latestApplied < threshold) {
    throw new Error(
      `database has ${app_tables} table(s) in "public" but its drizzle.__drizzle_migrations journal is not ` +
        `baselined past the bootstrap migrations (latest applied ${latestApplied || "none"} < required ${threshold}). ` +
        `This looks like a drizzle-kit push bootstrap (or a partial backfill). Refusing to run migrate() — it would ` +
        `treat the bootstrap migrations as pending and fail recreating existing objects. Backfill the journal with ` +
        `ALL already-applied migration tags first.`,
    );
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await assertBaselined(sql);
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("[migrate] schema is up to date");
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] FAILED:", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
