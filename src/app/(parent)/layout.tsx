import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { DashboardShellParent } from "@/components/parent/DashboardShellParent";

/**
 * Parent surface gate. Resolves the Better Auth session per-request (lazy
 * getAuth(), never at module top level) and bounces unauthenticated visitors to
 * sign-in before any parent data renders.
 */
export default async function ParentLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  return <DashboardShellParent>{children}</DashboardShellParent>;
}
