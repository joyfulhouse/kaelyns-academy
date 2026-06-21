/**
 * Admin gate — allowlist-based email check + requireAdmin() per-request helper.
 * Build-safe: no top-level getAuth() or getDb() calls.
 */
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
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
 */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthenticatedError();

  const email = session.user.email;
  const allowlist = getEnv("ADMIN_EMAILS", "");
  if (!isAdminEmail(email, allowlist)) throw new AdminForbiddenError();

  return { userId: session.user.id, email };
}
