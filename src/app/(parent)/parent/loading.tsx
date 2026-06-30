import { SkeletonBar, SkeletonCardGrid } from "@/components/boundaries/Skeleton";

/**
 * Default parent loading skeleton. Renders inside DashboardShellParent's main
 * column for parent routes without their own loader (`/parent`, `/parent/learners`,
 * `/parent/settings`, `/parent/curriculum/[slug]`). Mirrors the existing parent
 * skeleton idiom: a header block over a calm grid, quiet `.surface-parent`
 * styling (hairline borders, sunk fills) — a gentle pulse, never a spinner.
 */
export default function ParentLoading() {
  return (
    <div className="mx-auto max-w-5xl" role="status" aria-label="Loading">
      <header className="motion-safe:animate-pulse">
        <SkeletonBar className="h-4 w-24" />
        <SkeletonBar className="mt-2 h-9 w-56" />
        <SkeletonBar className="mt-3 h-4 w-full max-w-prose" />
      </header>

      <SkeletonCardGrid />
    </div>
  );
}
