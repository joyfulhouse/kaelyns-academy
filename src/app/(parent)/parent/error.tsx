"use client";

import { RouteErrorPanel } from "@/components/boundaries/RouteErrorPanel";
import { useRouteError } from "@/lib/hooks/useRouteError";

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
  useRouteError("Parent route error", error);

  return (
    <RouteErrorPanel
      title="Something went wrong loading your dashboard."
      body={
        <>
          We hit a snag on our end. Your account and your child&rsquo;s progress are safe — please
          try again.
        </>
      }
      reset={reset}
      digest={error.digest}
    />
  );
}
