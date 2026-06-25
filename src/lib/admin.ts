/**
 * Admin gate — allowlist-based email check + requireAdmin() per-request helper.
 * Build-safe: no top-level getAuth() or getDb() calls.
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
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

// ── Per-request auth gate ────────────────────────────────────────────────────

/**
 * Resolve the current request session and assert admin access.
 * @throws {UnauthenticatedError} when there is no valid session.
 * @throws {AdminForbiddenError} when the session user is not in ADMIN_EMAILS.
 * Build-safe: only invoked per-request, never at module top-level.
 *
 * SECURITY (P4): This gate authorizes purely by `email ∈ ADMIN_EMAILS`. With
 * self-serve signup enabled and email verification OFF, an attacker could
 * self-register an *unclaimed* allowlisted email and be admitted as admin
 * (the session's email is whatever they signed up with — it isn't proven to be
 * theirs). Accepted for the P0 homelab pilot: a single trusted operator, no
 * public traffic, and no durable third-party data behind the studio. The proper
 * fix lands in P4 — require a VERIFIED email (and/or a server-side role on the
 * user row) before this check, so an unverified address can never satisfy the
 * allowlist. Tracked in docs/claude/KNOWN-RISKS-P0-PILOT.md.
 */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthenticatedError();

  const email = session.user.email;
  const allowlist = getEnv("ADMIN_EMAILS", "");
  if (!isAdminEmail(email, allowlist)) throw new AdminForbiddenError();

  // Stale-session defense-in-depth: a session can outlive its user row (the
  // parent deleted their account, an admin pruned the user). Confirm the
  // principal still exists before granting admin; if it's gone, treat the
  // session as no-longer-valid — the SAME failure as "no session".
  const db = getDb();
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .limit(1);
  if (!row) throw new UnauthenticatedError();

  return { userId: session.user.id, email };
}
