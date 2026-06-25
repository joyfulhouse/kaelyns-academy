/**
 * Parent learner-detail loading skeleton. Renders inside DashboardShellParent's
 * main column, sketching the learner header and the per-domain progress sections
 * with quiet `.surface-parent` styling — hairline borders, sunk fills.
 */
export default function LearnerDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl" role="status" aria-label="Loading learner">
      <div className="h-4 w-20 rounded bg-paper-sunk motion-safe:animate-pulse" />

      <header className="mt-6 flex items-center gap-4 motion-safe:animate-pulse">
        <div className="size-16 shrink-0 rounded-full bg-paper-sunk" />
        <div className="min-w-0 flex-1">
          <div className="h-8 w-48 rounded bg-paper-sunk" />
          <div className="mt-2 h-4 w-32 rounded bg-paper-sunk" />
        </div>
      </header>

      <div className="mt-10 flex flex-col gap-4 motion-safe:animate-pulse" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-paper-sunk" />
        ))}
      </div>
    </div>
  );
}
