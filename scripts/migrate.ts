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
 * tables — bricking the deploy. The preflight refuses any journal not baselined
 * through the fixed push-bootstrap boundary (BOOTSTRAP_THROUGH_MILLIS) with an
 * actionable error, so this runner is safe to wire into the k3s-infra PreSync
 * Job. The journal must first be backfilled with ALL already-applied tags
 * (one-time ops step); until then, apply new expand-only migrations the current
 * way: `scripts/db.sh < drizzle/<file>.sql`.
 *
 * Bounded lock_timeout/statement_timeout (below) ensure a contended lock or a
 * runaway statement fails the gate fast rather than hanging the rollout. A
 * session-level pg_advisory_lock serializes overlapping runners (e.g. a PreSync
 * retry firing mid-run) so they queue instead of racing DDL/journal inserts.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const MIGRATIONS_FOLDER = "drizzle";

// Bound how long the migration may wait on locks / run a single statement, so a
// stuck or conflicting transaction makes the PreSync gate FAIL (and let ArgoCD
// surface/rollback) instead of hanging the rollout indefinitely. Plain (non-
// CONCURRENT) CREATE INDEX takes a brief SHARE lock on the table; at the current
// data volume it completes in well under a second, so these ceilings only ever
// trip on genuine contention. Tune up here (not by removing the bound) if a
// future migration legitimately needs longer.
const LOCK_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 120_000;

// Fixed key for a session-level pg_advisory_lock that serializes migration runs,
// so an overlapping invocation (e.g. an ArgoCD PreSync retry firing while a slow
// run is still in flight) waits its turn instead of racing DDL/journal inserts.
// The wait is bounded by statement_timeout above (pg_advisory_lock is a regular
// statement), so a stuck holder fails the gate fast rather than hanging it.
// Arbitrary but stable across runs; the value only has to be shared by all
// runners of THIS app (and stay within a JS-safe integer so it round-trips to
// postgres bigint without precision loss).
const MIGRATION_LOCK_KEY = 728_041_006_073; // "ka-migrate" namespace, fixed

/**
 * High-water mark of the migrations applied to the live DB OUTSIDE the Drizzle
 * journal (via `drizzle-kit push`): the `when` (folderMillis) of 0006, the last
 * migration that existed when this runner landed. This is the one-time
 * push-bootstrap boundary, NOT "the latest bare CREATE": it is a FIXED point in
 * history on purpose. Migrations authored after this runner are applied BY the
 * runner and journaled normally, so they must NOT raise the required baseline —
 * deriving the cutoff from "any bare CREATE migration" would wrongly refuse a
 * legitimate future additive CREATE TABLE on a DB correctly journaled to here.
 * When the prod journal is backfilled through 0006, bump this to the new last
 * tag's `when` in the SAME commit (or drop the guard once the journal is the
 * source of truth).
 */
const BOOTSTRAP_THROUGH_MILLIS = 1_782_503_921_314; // drizzle/meta/_journal.json → 0006_fancy_ma_gnuci

/**
 * Refuse to run against a database whose schema already exists but whose Drizzle
 * journal is not baselined through the push-bootstrap boundary. The live
 * `kaelyns-academy-db` was bootstrapped with `drizzle-kit push`, so its journal
 * is EMPTY while the tables already exist; a blind migrate() would treat 0000+
 * as pending and abort recreating existing objects — a duplicate-object error
 * that blocks (and retry-loops) the rollout. A *partial* manual baseline (only
 * some bootstrap rows inserted) hits the same trap, so the guard compares the
 * journal's latest timestamp against the boundary, not merely that it is
 * non-empty. A genuinely empty database (no app tables) is the normal first-run
 * case and is allowed; a DB journaled at/after the boundary is also allowed (so
 * future pending migrations apply normally).
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

  const latestApplied = journal_exists
    ? Number(
        (
          await sql<{ created_at: string | null }[]>`
            SELECT max(created_at)::text AS created_at FROM drizzle.__drizzle_migrations
          `
        )[0].created_at ?? 0,
      )
    : 0;
  if (latestApplied < BOOTSTRAP_THROUGH_MILLIS) {
    throw new Error(
      `database has ${app_tables} table(s) in "public" but its drizzle.__drizzle_migrations journal is not ` +
        `baselined through the push-bootstrap boundary (latest applied ${latestApplied || "none"} < required ` +
        `${BOOTSTRAP_THROUGH_MILLIS}). This looks like a drizzle-kit push bootstrap (or a partial backfill). ` +
        `Refusing to run migrate() — it would treat the bootstrap migrations as pending and fail recreating ` +
        `existing objects. Backfill the journal with ALL already-applied migration tags first.`,
    );
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  // Sent as session GUCs on connect, so they bound every statement migrate() runs.
  connection: { lock_timeout: LOCK_TIMEOUT_MS, statement_timeout: STATEMENT_TIMEOUT_MS },
});
try {
  // Serialize concurrent runners (see MIGRATION_LOCK_KEY). Blocking acquire,
  // bounded by statement_timeout; a retry waits for the in-flight run and then
  // finds the journal already caught up.
  await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
  try {
    await assertBaselined(sql);
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`.catch(() => {});
  }
  console.log("[migrate] schema is up to date");
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] FAILED:", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
