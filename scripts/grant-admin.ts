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
import { runCli } from "./lib/cli-db";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const userId = args.find((a) => !a.startsWith("-"));
if (!userId) {
  console.error("usage: bun run db:grant:admin <user-id> [--revoke]");
  process.exit(1);
}
const role = revoke ? "user" : "admin";

await runCli("grant-admin", async (sql) => {
  const [row] = await sql<{ email: string; role: string }[]>`
    UPDATE "user" SET role = ${role} WHERE id = ${userId} RETURNING email, role
  `;
  if (!row) {
    console.error(`[grant-admin] no user with id '${userId}' — nothing changed.`);
    return 1; // clean expected failure (not a thrown error): exit 1, no FAILED log
  }
  console.log(`[grant-admin] ${row.email} → role='${row.role}'`);
});
