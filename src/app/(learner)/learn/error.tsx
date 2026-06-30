"use client";

import { usePathname } from "next/navigation";
import { ArrowClockwiseIcon, CompassIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { KidMessagePanel } from "@/components/boundaries/KidMessagePanel";
import { useRouteError } from "@/lib/hooks/useRouteError";

/**
 * Kid-surface error boundary for the learner route group. Without it, an error
 * thrown inside /learn/* bubbles to the global error.tsx, which renders on a
 * plain (non-kid) surface and loses the warm, large-tap kid voice. Reuses the
 * shared KidMessagePanel wrapped in `.surface-kid` (bigger taps + base font) with
 * `size="kid"` actions. The error is reported as non-critical (never re-throws);
 * `reset()` retries the failed segment.
 */
export default function LearnerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useRouteError("Learner route error", error);

  // This boundary catches the picker (/learn) AND nested activity pages
  // (/learn/<program>/...). A nested failure can escape to the picker, but if
  // /learn itself is the failing segment the secondary action must NOT point
  // back at the broken page (a retry-only trap), so it goes to the site root —
  // mirroring the global boundary's pathname-based routing.
  const pathname = usePathname();
  const isNested = pathname?.startsWith("/learn/") ?? false;

  return (
    <KidMessagePanel
      surface
      mood="think"
      title="Oops, a little hiccup."
      body={<>Something got mixed up. Let&rsquo;s try that again, your place is saved.</>}
      digest={error.digest}
      actions={
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()} variant="primary" size="kid">
            <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
            Try again
          </Button>
          {isNested ? (
            <Button href="/learn" variant="soft" size="kid">
              <CompassIcon weight="bold" aria-hidden="true" />
              Go to my worlds
            </Button>
          ) : (
            <Button href="/" variant="soft" size="kid">
              <HouseIcon weight="bold" aria-hidden="true" />
              Take me home
            </Button>
          )}
        </div>
      }
    />
  );
}
