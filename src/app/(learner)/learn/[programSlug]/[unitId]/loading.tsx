import { KidLoadingShell } from "@/components/boundaries/KidLoadingShell";

/**
 * Calm kid loading shell for a unit's lesson list. Mirrors the AppShellKid frame
 * and a gently floating mascot — no spinners.
 */
export default function UnitLoading() {
  return (
    <KidLoadingShell
      ariaLabel="Getting your lessons ready"
      message="Getting your lessons ready..."
      mood="happy"
    >
      <ul className="mt-9 flex w-full flex-col gap-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="h-24 rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
          />
        ))}
      </ul>
    </KidLoadingShell>
  );
}
