import { KidLoadingShell } from "@/components/boundaries/KidLoadingShell";

/**
 * Calm kid loading shell for a single activity. Mirrors the AppShellKid frame
 * and a gently floating mascot — no spinners, so the wait feels like a friendly
 * pause rather than a stall.
 */
export default function ActivityLoading() {
  return (
    <KidLoadingShell ariaLabel="Getting this ready" message="Getting this ready..." mood="think">
      <div
        aria-hidden
        className="mt-9 h-72 w-full rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
      />
    </KidLoadingShell>
  );
}
