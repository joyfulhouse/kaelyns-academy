/**
 * Admin gate — server-side `role` authority + requireAdmin() per-request helper.
 * Build-safe: no top-level getAuth() or getDb() calls.
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { UnauthenticatedError } from "@/lib/tenancy";

// ── Types ────────────────────────────────────────────────────────────────────

export class AdminForbiddenError extends Error {
  constructor() {
    super("Forbidden: admin access required");
    this.name = "AdminForbiddenError";
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * PURE. Return true when `email` is present in the comma-separated `allowlist`.
 * Comparison is case-insensitive; entries are trimmed. Empty/no-match → false.
 *
 * SCOPE (P4): this is the **seed** list for the admin role
 * (scripts/seed-admin-roles.ts grants `role='admin'` to matching EXISTING users),
 * NOT the live authority. requireAdmin() trusts the user row's `role`, never this —
 * so a self-registered allowlisted email does not become admin on its own.
 */
export function isAdminEmail(
  email: string | null | undefined,
  allowlist: string,
): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  const entries = allowlist.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return entries.includes(normalized);
}

export type AdminVerdict = "ok" | "unauthenticated" | "forbidden";

/**
 * PURE. The admin-access decision given whether a session exists and the resolved
 * user row. Extracted so the core regression — a session whose row is `role:'user'`
 * is REJECTED even if its email is in ADMIN_EMAILS — is unit-testable without
 * mocking auth/DB.
 */
export function adminVerdict(
  hasSession: boolean,
  row: { role: string } | null | undefined,
): AdminVerdict {
  if (!hasSession) return "unauthenticated";
  if (!row) return "unauthenticated"; // session outlived its user row (stale)
  if (row.role !== "admin") return "forbidden";
  return "ok";
}

// ── Per-request resolver ─────────────────────────────────────────────────────

export type AdminAccess =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

/**
 * Resolve the current request's admin access from the AUTHORITATIVE user row:
 * `role` is read from the DB (not the session blob, not the allowlist), so a
 * revoked admin loses access on the next request even with a live cookie, and a
 * self-registered allowlisted email (default `role='user'`) is rejected. The same
 * `select` doubles as the stale-session check (a session can outlive its user row).
 * Build-safe: only invoked per-request, never at module top-level.
 */
export async function resolveAdminAccess(): Promise<AdminAccess> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const db = getDb();
  const [row] = await db
    .select({ id: schema.user.id, email: schema.user.email, role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .limit(1);

  const verdict = adminVerdict(true, row);
  if (verdict === "ok" && row) return { ok: true, userId: row.id, email: row.email };
  return { ok: false, reason: verdict === "ok" ? "unauthenticated" : verdict };
}

/**
 * Assert admin access for the current request.
 * @throws {UnauthenticatedError} no valid session, or the session's user row is gone.
 * @throws {AdminForbiddenError} authenticated but the user's `role !== 'admin'`.
 *
 * SECURITY (P4): authority is the per-user `role` column, NOT the `ADMIN_EMAILS`
 * allowlist. The allowlist only **seeds** the role, and the seed
 * (scripts/seed-admin-roles.ts) grants admin ONLY to *email-verified* allowlisted
 * rows — so a self-registered allowlisted email both defaults to `role='user'` AND
 * cannot be promoted while unverified. This closes the "unclaimed allowlisted email
 * → instant admin" vector (docs/claude/KNOWN-RISKS-P0-PILOT.md); while verification
 * is off, the operator is bootstrapped out of band by confirmed user id (DEPLOY.md).
 * (Stage 2, deferred until an email transport exists: additionally require
 * `emailVerified === true` in this gate to prove identity on every request.)
 * Build-safe: only invoked per-request, never at module top-level.
 */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const access = await resolveAdminAccess();
  if (access.ok) return { userId: access.userId, email: access.email };
  if (access.reason === "unauthenticated") throw new UnauthenticatedError();
  throw new AdminForbiddenError();
}
