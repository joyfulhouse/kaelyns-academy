import type { Metadata } from "next";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Not found" };

/**
 * Parent-segment 404. Server component rendered inside the (parent) layout, so
 * the dashboard chrome stays. Quiet `.surface-parent` tone (no kid Mascot) with
 * parent-appropriate copy — a learner or program that's been removed from the
 * account lands here, with a clear path back to the learners list.
 */
export default function ParentNotFound() {
  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-md border border-line bg-paper-sunk text-ink-soft"
      >
        <UsersThreeIcon weight="regular" className="size-6" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">
        We couldn&rsquo;t find that.
      </h1>
      <p className="mt-3 text-ink-soft">
        It may have been removed from your account. Let&rsquo;s head back to your learners.
      </p>
      <div className="mt-8">
        <Button href="/parent/learners" variant="soft" size="md">
          Back to learners
        </Button>
      </div>
    </div>
  );
}
