"use client";

import { useEffect } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { captureNonCritical } from "@/lib/capture";

/**
 * Admin-segment error boundary. Renders inside the (admin) layout, so the
 * AdminShell chrome stays around it — this only replaces the failing page body.
 * Quiet `.surface-parent` tone (the admin area shares it): a factual recovery
 * for an operator, not the kid studio. Reported to Sentry as non-critical (never
 * re-thrown); `reset()` retries the failed segment.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureNonCritical("Admin route error", error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Something went wrong in the admin console.
      </h1>
      <p className="mt-3 text-ink-soft">
        We hit an error loading this view. No changes were lost — please try again.
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
