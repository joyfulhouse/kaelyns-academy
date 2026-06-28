import { useEffect } from "react";
import { captureNonCritical } from "@/lib/capture";

/** Report a route-segment error to Sentry as non-critical, once per error. Used by route error boundaries. */
export function useRouteError(context: string, error: Error & { digest?: string }): void {
  useEffect(() => {
    captureNonCritical(context, error);
  }, [context, error]);
}
