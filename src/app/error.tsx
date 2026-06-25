"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowClockwiseIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/art/Mascot";
import { captureNonCritical } from "@/lib/capture";

/**
 * Route-segment error boundary (App Router). Renders inside the root layout, so
 * it inherits <html>/<body>, fonts, and the Wonder Studio shell — keep it warm
 * and reassuring rather than alarming. The thrown error is reported to Sentry as
 * non-critical (it never re-throws), and `reset()` retries the failed segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureNonCritical("Route error boundary", error);
  }, [error]);

  // Keep a child who errors mid-activity inside the studio rather than dropping
  // them on the marketing homepage (a dead-end for a non-reader). Only NESTED
  // learner routes (/learn/<program>/...) fall back to the studio picker; if
  // /learn itself is the failing segment, "Go home" must not point back at the
  // broken page, so it goes to the site root. Other surfaces use the root too.
  const pathname = usePathname();
  const homeHref = pathname?.startsWith("/learn/") ? "/learn" : "/";

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-md">
        <Mascot mood="think" size={140} className="mx-auto motion-safe:animate-float" />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink">
          Oops, a little hiccup.
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          Something went sideways on our end. Let&rsquo;s try that again, your place is saved.
        </p>
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
        {error.digest && (
          <p className="mt-6 text-sm text-ink-faint">Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
