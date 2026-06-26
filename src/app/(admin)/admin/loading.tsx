/**
 * Default admin loading skeleton. Renders inside AdminShell's main column for
 * admin routes without their own loader. Mirrors the parent skeleton idiom: a
 * header block over a calm stack of rows, quiet `.surface-parent` styling
 * (hairline borders, sunk fills) — a gentle pulse, never a spinner.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading">
      <header className="motion-safe:animate-pulse">
        <div className="h-7 w-40 rounded bg-paper-sunk" />
        <div className="mt-2 h-4 w-64 rounded bg-paper-sunk" />
      </header>

      <div className="flex flex-col gap-2 motion-safe:animate-pulse" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl border border-line bg-paper-sunk" />
        ))}
      </div>
    </div>
  );
}
