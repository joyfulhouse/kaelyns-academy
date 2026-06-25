import { Mascot } from "@/components/art/Mascot";

/**
 * Calm kid loading shell for a program's world map. Mirrors the AppShellKid
 * frame and a gently floating mascot — no spinners, no anxious chrome.
 */
export default function ProgramLoading() {
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div
          className="flex flex-col items-center pt-10 text-center"
          role="status"
          aria-label="Opening your world"
        >
          <Mascot mood="happy" size={96} className="motion-safe:animate-float" />
          <p className="mt-6 text-base text-ink-faint">Opening your world...</p>
          <ul className="mt-9 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li
                key={i}
                className="h-36 rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
              />
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
