import type { Metadata } from "next";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { NotFoundPanel } from "@/components/boundaries/NotFoundPanel";

export const metadata: Metadata = { title: "Not found" };

/**
 * Parent-segment 404. Server component rendered inside the (parent) layout, so
 * the dashboard chrome stays. Quiet `.surface-parent` tone (no kid Mascot) with
 * parent-appropriate copy — a learner or program that's been removed from the
 * account lands here, with a clear path back to the learners list.
 */
export default function ParentNotFound() {
  return (
    <NotFoundPanel
      icon={<UsersThreeIcon weight="regular" className="size-6" />}
      body={
        <>It may have been removed from your account. Let&rsquo;s head back to your learners.</>
      }
      actionHref="/parent/learners"
      actionLabel="Back to learners"
    />
  );
}
