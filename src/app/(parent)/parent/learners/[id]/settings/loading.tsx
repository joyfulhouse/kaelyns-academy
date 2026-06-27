/**
 * Per-learner settings loading skeleton. Renders inside DashboardShellParent's
 * main column, sketching the back link, header, and the settings card with quiet
 * `.surface-parent` styling (hairline borders, sunk fills) — calm, never chrome.
 */
export default function LearnerSettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="Loading settings">
      <div className="h-4 w-28 rounded bg-paper-sunk motion-safe:animate-pulse" />

      <header className="mt-6 motion-safe:animate-pulse">
        <div className="h-4 w-24 rounded bg-paper-sunk" />
        <div className="mt-2 h-8 w-64 rounded bg-paper-sunk" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-paper-sunk" />
      </header>

      <div className="mt-8 motion-safe:animate-pulse" aria-hidden>
        <div className="h-5 w-32 rounded bg-paper-sunk" />
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-paper-sunk" />
          ))}
        </div>
      </div>
    </div>
  );
}
