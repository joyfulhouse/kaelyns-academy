"use client";

import { RouteErrorPanel } from "@/components/boundaries/RouteErrorPanel";
import { useRouteError } from "@/lib/hooks/useRouteError";

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
  useRouteError("Admin route error", error);

  return (
    <RouteErrorPanel
      title="Something went wrong in the admin console."
      body="We hit an error loading this view. No changes were lost — please try again."
      reset={reset}
      digest={error.digest}
    />
  );
}
