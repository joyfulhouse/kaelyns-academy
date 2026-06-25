import { Mascot } from "@/components/art/Mascot";

/**
 * Calm kid loading shell for the program picker. Mirrors the AppShellKid frame
 * (warm header strip + centered mascot) and the picker's own loading beat — a
 * gently floating mascot, never a spinner.
 */
export default function LearnLoading() {
  return (
    <div className="surface-kid flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-50 border-b-2 border-line bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-20 w-full max-w-5xl items-center gap-3 px-4">
          <span aria-hidden className="size-16 shrink-0 rounded-full bg-paper-sunk" />
          <span className="mx-auto flex items-center gap-2.5">
            <Mascot size={44} mood="happy" className="motion-safe:animate-float" />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              Kaelyn&rsquo;s Academy
            </span>
          </span>
          <span aria-hidden className="size-16 shrink-0" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div
          className="flex flex-col items-center pt-10 text-center"
          role="status"
          aria-label="Getting your worlds ready"
        >
          <Mascot mood="happy" size={96} className="motion-safe:animate-float" />
          <p className="mt-6 text-base text-ink-faint">Getting your worlds ready...</p>
          <ul className="mt-9 grid w-full gap-5 sm:grid-cols-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="h-44 rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
              />
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
