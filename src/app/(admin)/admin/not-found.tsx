import type { Metadata } from "next";
import { PencilRulerIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Not found" };

/**
 * Admin-segment 404. Server component rendered inside the (admin) layout, so the
 * AdminShell chrome stays. Quiet `.surface-parent` tone with operator-appropriate
 * copy — a program or record that no longer exists lands here, with a clear path
 * back to the admin console.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-md border border-line bg-paper-sunk text-ink-soft"
      >
        <PencilRulerIcon weight="regular" className="size-6" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">
        We couldn&rsquo;t find that.
      </h1>
      <p className="mt-3 text-ink-soft">
        This record may have been removed or renamed. Head back to the program list.
      </p>
      <div className="mt-8">
        <Button href="/admin" variant="soft" size="md">
          Back to admin
        </Button>
      </div>
    </div>
  );
}
