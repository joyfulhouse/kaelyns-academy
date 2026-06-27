/**
 * Per-learner provenance ("what the AI made") loading skeleton. Renders inside
 * DashboardShellParent's main column, sketching the back link, header, and a few
 * trail rows with quiet `.surface-parent` styling (hairline borders, sunk fills).
 */
export default function LearnerActivityLoading() {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="Loading activity">
      <div className="h-4 w-28 rounded bg-paper-sunk motion-safe:animate-pulse" />

      <header className="mt-6 motion-safe:animate-pulse">
        <div className="h-4 w-24 rounded bg-paper-sunk" />
        <div className="mt-2 h-8 w-72 max-w-full rounded bg-paper-sunk" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-paper-sunk" />
      </header>

      <div className="mt-8 overflow-hidden rounded-xl border border-line motion-safe:animate-pulse" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}>
            <div className="size-9 shrink-0 rounded-md bg-paper-sunk" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-40 rounded bg-paper-sunk" />
              <div className="mt-1.5 h-3 w-24 rounded bg-paper-sunk" />
            </div>
            <div className="h-4 w-16 rounded bg-paper-sunk" />
          </div>
        ))}
      </div>
    </div>
  );
}
