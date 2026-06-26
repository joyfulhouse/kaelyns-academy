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
 * `drizzle.__drizzle_migrations` journal is EMPTY while the tables already
 * exist. Running migrate() blindly there would treat 0000+ as pending and abort
 * recreating existing tables — bricking the deploy. The preflight refuses that
 * state with an actionable error instead, so this runner is safe to wire into
 * the k3s-infra PreSync Job. The journal must first be backfilled with the
 * already-applied tags (one-time ops step); until then, apply new expand-only
 * migrations the current way: `scripts/db.sh < drizzle/<file>.sql`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

/**
 * Refuse to run against a database whose schema already exists but whose Drizzle
 * journal is empty/absent (a `drizzle-kit push` bootstrap). In that state every
 * migration looks pending and migrate() would fail recreating existing objects;
 * a duplicate-object abort would block — and keep retrying — the rollout. Bail
 * with a clear baseline instruction instead. (A genuinely empty database — no
 * app tables, no journal — is the normal first-run case and is allowed.)
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

  const journalRows = journal_exists
    ? Number((await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0].n)
    : 0;
  if (journalRows === 0) {
    throw new Error(
      `database has ${app_tables} table(s) in "public" but an empty drizzle.__drizzle_migrations journal ` +
        `(a drizzle-kit push bootstrap). Refusing to run migrate() — it would treat 0000+ as pending and ` +
        `fail recreating existing tables. Backfill the journal with the already-applied migration tags first.`,
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
