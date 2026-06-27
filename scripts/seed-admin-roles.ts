/**
 * Seed the admin role from the ADMIN_EMAILS allowlist.
 *
 * Sets role='admin' on every EXISTING user row whose email is in $ADMIN_EMAILS
 * (case-insensitive). Idempotent + reusable: re-running reconciles the allowlist
 * into roles — a no-op when nothing changes, and a no-op for allowlisted emails
 * that aren't registered yet.
 *
 * This is the *seed/grant* path for the P4 admin gate. requireAdmin() trusts the
 * per-user `role` column, NOT the allowlist, so this script is how an
 * operator-controlled email becomes admin. Run it AFTER the 0007 migration adds the
 * column and, critically, BEFORE the role gate goes live so the operator is not
 * locked out (see DEPLOY.md / KNOWN-RISKS-P0-PILOT.md).
 *
 * Reads $DATABASE_URL and $ADMIN_EMAILS. Build-safe: a standalone CLI, never
 * imported by the app; connects lazily and exits with a deterministic code.
 */
import postgres from "postgres";

const LOCK_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[seed-admin-roles] DATABASE_URL is not set");
  process.exit(1);
}

const allowlist = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const sql = postgres(url, {
  max: 1,
  connection: { lock_timeout: LOCK_TIMEOUT_MS, statement_timeout: STATEMENT_TIMEOUT_MS },
});

try {
  if (allowlist.length === 0) {
    console.log("[seed-admin-roles] ADMIN_EMAILS is empty — nothing to seed.");
    await sql.end();
    process.exit(0);
  }

  // Grant admin only to already-registered allowlisted users; `role <> 'admin'`
  // keeps re-runs a no-op and makes the RETURNING set exactly the newly-granted rows.
  const granted = await sql<{ email: string }[]>`
    UPDATE "user" SET role = 'admin'
    WHERE lower(email) = ANY(${allowlist}) AND role <> 'admin'
    RETURNING email
  `;

  console.log(
    granted.length === 0
      ? "[seed-admin-roles] no changes (allowlisted users already admin, or not registered yet)."
      : `[seed-admin-roles] granted admin to ${granted.length} user(s): ${granted.map((g) => g.email).join(", ")}`,
  );
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[seed-admin-roles] FAILED:", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
