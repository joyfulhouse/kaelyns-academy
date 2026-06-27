/**
 * Grant (or revoke) the admin role by CONFIRMED user id.
 *
 * This is the out-of-band bootstrap for the P4 role gate while Better Auth email
 * verification is off: an email string is not proof of ownership, so admin is
 * granted to a SPECIFIC user id the operator has confirmed is theirs — never by
 * matching an unverified email (that is the vector the role gate closes; see
 * scripts/seed-admin-roles.ts for the verified-email reconcile path used once
 * verification lands).
 *
 * Usage:
 *   DATABASE_URL=… bun run db:grant:admin <user-id>            # grant admin
 *   DATABASE_URL=… bun run db:grant:admin <user-id> --revoke   # demote to 'user'
 *
 * Idempotent; prints the affected row and fails loudly if the id doesn't exist.
 * Build-safe: standalone CLI, never imported by the app; connects lazily and exits.
 */
import postgres from "postgres";

const LOCK_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[grant-admin] DATABASE_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const userId = args.find((a) => !a.startsWith("-"));
if (!userId) {
  console.error("usage: bun run db:grant:admin <user-id> [--revoke]");
  process.exit(1);
}
const role = revoke ? "user" : "admin";

const sql = postgres(url, {
  max: 1,
  connection: { lock_timeout: LOCK_TIMEOUT_MS, statement_timeout: STATEMENT_TIMEOUT_MS },
});

try {
  const [row] = await sql<{ email: string; role: string }[]>`
    UPDATE "user" SET role = ${role} WHERE id = ${userId} RETURNING email, role
  `;
  if (!row) {
    console.error(`[grant-admin] no user with id '${userId}' — nothing changed.`);
    await sql.end();
    process.exit(1);
  }
  console.log(`[grant-admin] ${row.email} → role='${row.role}'`);
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[grant-admin] FAILED:", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
