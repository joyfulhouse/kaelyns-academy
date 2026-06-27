import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveAdminAccess } from "@/lib/admin";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Admin surface gate (UX). Mirrors the authority in requireAdmin():
 *   1. No / stale session → redirect to /sign-in.
 *   2. Session but role !== 'admin' → redirect to /parent.
 *   3. Admin → render the admin shell.
 *
 * The security boundary is requireAdmin() in the server actions (an attacker
 * hitting an action directly never sees this layout); this redirect only keeps the
 * UX consistent. Both resolve the same authoritative `role` from the user row via
 * resolveAdminAccess() — the ADMIN_EMAILS allowlist is only a seed (P4).
 *
 * force-dynamic: the session cookie and BETTER_AUTH_SECRET are resolved
 * per-request; these pages must never be statically prerendered.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await resolveAdminAccess();

  if (!access.ok) {
    redirect(access.reason === "unauthenticated" ? "/sign-in" : "/parent");
  }

  return <AdminShell>{children}</AdminShell>;
}
