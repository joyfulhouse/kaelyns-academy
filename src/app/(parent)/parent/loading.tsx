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
        <div className="h-4 w-24 rounded bg-paper-sunk" />
        <div className="mt-2 h-9 w-56 rounded bg-paper-sunk" />
        <div className="mt-3 h-4 w-full max-w-prose rounded bg-paper-sunk" />
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
