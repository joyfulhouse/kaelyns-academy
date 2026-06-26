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
 * PREREQUISITE before wiring this into the PreSync Job (NOT done in this change —
 * the Job lives in k3s-infra and migrations are still applied manually per
 * DEPLOY.md): the live `kaelyns-academy-db` was bootstrapped with `drizzle-kit
 * push`, so `drizzle.__drizzle_migrations` is EMPTY. Running this against it
 * unbaselined would treat 0000+ as pending and fail recreating existing tables.
 * The journal MUST first be backfilled with the already-applied tags
 * (0000..0006) as a one-time ops step. Until then, apply new expand-only
 * migrations the current way: `scripts/db.sh < drizzle/<file>.sql`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("[migrate] schema is up to date");
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] FAILED:", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
