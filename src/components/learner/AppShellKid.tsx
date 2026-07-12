"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { ArrowLeftIcon, SpeakerHighIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import { SkipLink, MAIN_CONTENT_ID } from "@/components/a11y/SkipLink";
import { Mascot } from "@/components/art/Mascot";
import { canSpeak, speak, stopSpeaking } from "./speak";

/**
 * The kid surface frame (DESIGN.md §6). Applies `.surface-kid` (raises tap-min
 * to 96px + base font), a warm top bar with the mascot, a big round back
 * button, and an optional read-aloud speaker. Almost no chrome text: actions
 * lead with icon + size + color, labels are screen-reader only.
 */
export function AppShellKid({
  children,
  backHref,
  /** Spoken when the speaker button is tapped; omit to hide the speaker. */
  readAloud,
  /** Optional world for accent theming of the shell's own chrome. */
  className,
}: {
  children: ReactNode;
  backHref?: string;
  readAloud?: string;
  className?: string;
}) {
  const router = useRouter();

  // Never let narration bleed across pages.
  useEffect(() => stopSpeaking, []);

  function handleBack() {
    stopSpeaking();
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  }

  const showSpeaker = typeof readAloud === "string" && readAloud.trim().length > 0;

  return (
    <div
      className={cn("surface-kid relative flex min-h-dvh flex-col bg-paper", className)}
    >
      <SkipLink />
      <header className="sticky top-0 z-50 border-b-2 border-line bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-28 w-full max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className={cn(
              "grid size-24 shrink-0 place-items-center rounded-full",
              "border-[3px] border-ink bg-paper-raised text-ink shadow-pop",
              "transition active:translate-y-1 active:shadow-none",
              "motion-safe:hover:-translate-y-0.5",
            )}
          >
            <ArrowLeftIcon weight="bold" className="size-10" />
          </button>

          <span className="mx-auto flex items-center gap-2.5">
            <Mascot size={44} mood="happy" className="motion-safe:animate-float" />
            <span className="hidden font-display text-xl font-semibold tracking-tight text-ink sm:inline">
              Kaelyn&rsquo;s Academy
            </span>
          </span>

          {/* Keep the title centered: a spacer balances the back button when
              the speaker is hidden. */}
          {showSpeaker && canSpeak() ? (
            <button
              type="button"
              onClick={() => speak(readAloud)}
              aria-label="Read this aloud"
              className={cn(
                "grid size-24 shrink-0 place-items-center rounded-full",
                "border-[3px] border-ink bg-honey text-ink shadow-pop",
                "transition active:translate-y-1 active:shadow-none",
                "motion-safe:hover:-translate-y-0.5",
              )}
            >
              <SpeakerHighIcon weight="fill" className="size-10" />
            </button>
          ) : (
            <span aria-hidden className="size-24 shrink-0" />
          )}
        </div>
      </header>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}
