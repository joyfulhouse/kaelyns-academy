"use client";

import { useEffect } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { captureNonCritical } from "@/lib/capture";

/**
 * Parent-segment error boundary. Renders inside the (parent) layout, so the
 * dashboard chrome (DashboardShellParent) stays around it — this only replaces
 * the failing page body. Quiet `.surface-parent` tone (no kid Mascot): an adult
 * reading their child's progress wants a calm, factual recovery, not a cartoon.
 * The error is reported to Sentry as non-critical (never re-thrown); `reset()`
 * retries the failed segment.
 */
export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureNonCritical("Parent route error", error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Something went wrong loading your dashboard.
      </h1>
      <p className="mt-3 text-ink-soft">
        We hit a snag on our end. Your account and your child&rsquo;s progress are safe — please
        try again.
      </p>
      <div className="mt-8">
        <Button onClick={() => reset()} variant="primary" size="md">
          <ArrowClockwiseIcon weight="bold" className="size-4" />
          Try again
        </Button>
      </div>
      {error.digest && (
        <p className="mt-6 text-sm text-ink-faint">Reference: {error.digest}</p>
      )}
    </div>
  );
}
