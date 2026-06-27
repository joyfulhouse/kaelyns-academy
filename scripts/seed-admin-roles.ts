/**
 * Reconcile the admin role from the ADMIN_EMAILS allowlist — VERIFIED emails only.
 *
 * Sets role='admin' on every existing user row whose email is in $ADMIN_EMAILS
 * (case-insensitive) **and** whose email is verified (`email_verified = true`).
 * Idempotent + reusable: re-running reconciles the allowlist into roles — a no-op
 * when nothing changes, and a no-op for allowlisted emails that aren't registered.
 *
 * Why verified-only (security): an email string in the allowlist is NOT proof that
 * the row belongs to the operator. While Better Auth email verification is off
 * (P4 Stage 2, deferred), an attacker could pre-register an unclaimed allowlisted
 * address; granting admin off the email alone would re-open the very
 * self-register-as-admin vector the P4 role gate closes. So this script refuses to
 * grant on an unverified row and warns loudly instead. Until Stage 2 lands (every
 * row is unverified), this is effectively a safe no-op — bootstrap the operator
 * OUT OF BAND by their confirmed user id (see DEPLOY.md → "Granting admin access").
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

  // Warn loudly about allowlisted rows that EXIST but are UNVERIFIED: these are the
  // dangerous ones (email unproven), so we never grant them admin here.
  const unverified = await sql<{ email: string }[]>`
    SELECT email FROM "user"
    WHERE lower(email) = ANY(${allowlist}) AND email_verified = false
  `;
  if (unverified.length > 0) {
    console.warn(
      `[seed-admin-roles] REFUSED to grant admin to ${unverified.length} UNVERIFIED allowlisted ` +
        `email(s) — an email is not proof of ownership while verification is off: ` +
        `${unverified.map((r) => r.email).join(", ")}. Bootstrap the operator out of band by ` +
        `confirmed user id (DEPLOY.md), or enable email verification (P4 Stage 2).`,
    );
  }

  // Grant admin only to VERIFIED allowlisted users; `role <> 'admin'` keeps re-runs
  // a no-op and makes the RETURNING set exactly the newly-granted rows.
  const granted = await sql<{ email: string }[]>`
    UPDATE "user" SET role = 'admin'
    WHERE lower(email) = ANY(${allowlist}) AND email_verified = true AND role <> 'admin'
    RETURNING email
  `;

  console.log(
    granted.length === 0
      ? "[seed-admin-roles] no admin grants (verified allowlisted users already admin, or none registered/verified)."
      : `[seed-admin-roles] granted admin to ${granted.length} verified user(s): ${granted.map((g) => g.email).join(", ")}`,
  );
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[seed-admin-roles] FAILED:", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
