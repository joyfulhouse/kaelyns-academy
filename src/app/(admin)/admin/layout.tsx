import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { isAdminEmail } from "@/lib/admin";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Admin surface gate. Mirrors the parent layout but adds the admin-email check:
 *   1. No session → redirect to /sign-in.
 *   2. Session but not in ADMIN_EMAILS → redirect to /parent.
 *   3. Admin → render the admin shell.
 *
 * force-dynamic: the session cookie and BETTER_AUTH_SECRET are resolved
 * per-request; these pages must never be statically prerendered.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/sign-in");

  if (!isAdminEmail(session.user.email, getEnv("ADMIN_EMAILS", ""))) {
    redirect("/parent");
  }

  return <AdminShell>{children}</AdminShell>;
}
