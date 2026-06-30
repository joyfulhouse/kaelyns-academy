import { KidLoadingShell } from "@/components/boundaries/KidLoadingShell";

/**
 * Calm kid loading shell for the program picker. Mirrors the AppShellKid frame
 * (warm header strip + centered mascot) and the picker's own loading beat — a
 * gently floating mascot, never a spinner.
 */
export default function LearnLoading() {
  return (
    <KidLoadingShell
      ariaLabel="Getting your worlds ready"
      message="Getting your worlds ready..."
      mood="happy"
    >
      <ul className="mt-9 grid w-full gap-5 sm:grid-cols-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="h-44 rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
          />
        ))}
      </ul>
    </KidLoadingShell>
  );
}
