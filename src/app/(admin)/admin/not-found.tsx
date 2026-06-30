import type { Metadata } from "next";
import { PencilRulerIcon } from "@phosphor-icons/react/dist/ssr";
import { NotFoundPanel } from "@/components/boundaries/NotFoundPanel";

export const metadata: Metadata = { title: "Not found" };

/**
 * Admin-segment 404. Server component rendered inside the (admin) layout, so the
 * AdminShell chrome stays. Quiet `.surface-parent` tone with operator-appropriate
 * copy — a program or record that no longer exists lands here, with a clear path
 * back to the admin console.
 */
export default function AdminNotFound() {
  return (
    <NotFoundPanel
      icon={<PencilRulerIcon weight="regular" className="size-6" />}
      body="This record may have been removed or renamed. Head back to the program list."
      actionHref="/admin"
      actionLabel="Back to admin"
    />
  );
}
