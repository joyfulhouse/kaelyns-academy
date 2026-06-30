"use client";

import { usePathname } from "next/navigation";
import { ArrowClockwiseIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { KidMessagePanel } from "@/components/boundaries/KidMessagePanel";
import { useRouteError } from "@/lib/hooks/useRouteError";

/**
 * Route-segment error boundary (App Router). Renders inside the root layout, so
 * it inherits <html>/<body>, fonts, and the Wonder Studio shell — keep it warm
 * and reassuring rather than alarming. Reuses the shared KidMessagePanel on the
 * plain root surface. The thrown error is reported to Sentry as non-critical (it
 * never re-throws), and `reset()` retries the failed segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useRouteError("Route error boundary", error);

  // Keep a child who errors mid-activity inside the studio rather than dropping
  // them on the marketing homepage (a dead-end for a non-reader). Only NESTED
  // learner routes (/learn/<program>/...) fall back to the studio picker; if
  // /learn itself is the failing segment, "Go home" must not point back at the
  // broken page, so it goes to the site root. Other surfaces use the root too.
  const pathname = usePathname();
  const homeHref = pathname?.startsWith("/learn/") ? "/learn" : "/";

  return (
    <KidMessagePanel
      mood="think"
      title="Oops, a little hiccup."
      body={
        <>Something went sideways on our end. Let&rsquo;s try that again, your place is saved.</>
      }
      digest={error.digest}
      actions={
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()} variant="primary" size="lg">
            <ArrowClockwiseIcon weight="bold" />
            Try again
          </Button>
          <Button href={homeHref} variant="soft" size="lg">
            <HouseIcon weight="bold" />
            Go home
          </Button>
        </div>
      }
    />
  );
}
