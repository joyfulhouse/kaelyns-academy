import type { ReactNode } from "react";
import { Mascot, type MascotMood } from "@/components/art/Mascot";
import { cn } from "@/lib/cn";

/**
 * Shared scaffold for the kid-voice boundary screens — the learner route group's
 * error + 404 and the root error + 404. All four center a floating Mascot over a
 * warm heading, a reassuring line, an actions row, and an optional Sentry digest.
 * They differ only in the `.surface-kid` wrapper (learner group) vs the plain
 * root surface, the Mascot mood, the copy, and the actions (button size + order),
 * so those are passed in. Each boundary keeps its own nature ("use client" for
 * the error boundaries, server for the 404s), its context, its EXACT copy, and
 * its button order — the actions row is owned per-boundary.
 */
export function KidMessagePanel({
  surface = false,
  mood,
  title,
  body,
  actions,
  digest,
}: {
  /** When true, wraps the panel in `.surface-kid` (bigger taps + base font). */
  surface?: boolean;
  mood: MascotMood;
  title: ReactNode;
  body: ReactNode;
  /** The full actions row, kept per-boundary (each owns its button set + order). */
  actions: ReactNode;
  digest?: string;
}) {
  return (
    <main
      className={cn(
        surface && "surface-kid",
        "grid min-h-dvh place-items-center bg-paper px-6 text-center",
      )}
    >
      <div className="max-w-md">
        <Mascot mood={mood} size={140} className="mx-auto motion-safe:animate-float" />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 text-lg text-ink-soft">{body}</p>
        {actions}
        {digest && (
          <p className="mt-6 text-sm text-ink-faint">Reference: {digest}</p>
        )}
      </div>
    </main>
  );
}
