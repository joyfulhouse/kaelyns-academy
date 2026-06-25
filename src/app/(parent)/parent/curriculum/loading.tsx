/**
 * Parent curriculum loading skeleton. Renders inside DashboardShellParent's main
 * column, so it only sketches the page body: a header block and a calm grid of
 * program cards. Quiet `.surface-parent` styling — hairline borders, sunk fills.
 */
export default function CurriculumLoading() {
  return (
    <div className="mx-auto max-w-4xl" role="status" aria-label="Loading curriculum">
      <header className="motion-safe:animate-pulse">
        <div className="h-4 w-24 rounded bg-paper-sunk" />
        <div className="mt-2 h-9 w-56 rounded bg-paper-sunk" />
        <div className="mt-3 h-4 w-full max-w-prose rounded bg-paper-sunk" />
        <div className="mt-2 h-4 w-2/3 max-w-prose rounded bg-paper-sunk" />
      </header>

      <div
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 motion-safe:animate-pulse"
        aria-hidden
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-xl border border-line bg-paper-sunk" />
        ))}
      </div>
    </div>
  );
}
