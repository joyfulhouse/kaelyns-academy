import type { ReactNode } from "react";
import { Mascot, type MascotMood } from "@/components/art/Mascot";

/**
 * Calm kid loading frame shared by every `/learn/**` loader. Mirrors the
 * AppShellKid chrome — the `.surface-kid` column + sticky header (placeholder
 * avatar, centered Mascot + wordmark, balancing spacer) — then a centered
 * `role="status"` region with a gently floating Mascot and a friendly line.
 * Each loader passes its own aria label, message, mood, and skeleton body (and,
 * where it differs from the default, the `<main>` width). Never a spinner.
 */
export function KidLoadingShell({
  ariaLabel,
  message,
  mood,
  mainClassName = "mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8",
  children,
}: {
  ariaLabel: string;
  message: string;
  mood: MascotMood;
  /** Full `<main>` class string; defaults to the max-w-3xl loaders' width. */
  mainClassName?: string;
  children: ReactNode;
}) {
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

      <main className={mainClassName}>
        <div
          className="flex flex-col items-center pt-10 text-center"
          role="status"
          aria-label={ariaLabel}
        >
          <Mascot mood={mood} size={96} className="motion-safe:animate-float" />
          <p className="mt-6 text-base text-ink-faint">{message}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
