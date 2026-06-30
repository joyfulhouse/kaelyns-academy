import { KidLoadingShell } from "@/components/boundaries/KidLoadingShell";

/**
 * Calm kid loading shell for a program's world map. Mirrors the AppShellKid
 * frame and a gently floating mascot — no spinners, no anxious chrome.
 */
export default function ProgramLoading() {
  return (
    <KidLoadingShell
      ariaLabel="Opening your world"
      message="Opening your world..."
      mood="happy"
      mainClassName="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
    >
      <ul className="mt-9 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li
            key={i}
            className="h-36 rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
          />
        ))}
      </ul>
    </KidLoadingShell>
  );
}
