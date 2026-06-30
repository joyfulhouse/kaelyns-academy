import { SkeletonBar, SkeletonCardGrid } from "@/components/boundaries/Skeleton";

/**
 * Parent curriculum loading skeleton. Renders inside DashboardShellParent's main
 * column, so it only sketches the page body: a header block and a calm grid of
 * program cards. Quiet `.surface-parent` styling — hairline borders, sunk fills.
 */
export default function CurriculumLoading() {
  return (
    <div className="mx-auto max-w-4xl" role="status" aria-label="Loading curriculum">
      <header className="motion-safe:animate-pulse">
        <SkeletonBar className="h-4 w-24" />
        <SkeletonBar className="mt-2 h-9 w-56" />
        <SkeletonBar className="mt-3 h-4 w-full max-w-prose" />
        <SkeletonBar className="mt-2 h-4 w-2/3 max-w-prose" />
      </header>

      <SkeletonCardGrid />
    </div>
  );
}
