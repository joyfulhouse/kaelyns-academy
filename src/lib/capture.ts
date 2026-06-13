import * as Sentry from "@sentry/nextjs";

/** Non-fatal: visible in Sentry as a warning, never alerts, never throws. */
export function captureNonCritical(message: string, error: unknown): void {
  try {
    Sentry.withScope((scope) => {
      scope.setLevel("warning");
      Sentry.captureException(error instanceof Error ? error : new Error(`${message}: ${String(error)}`));
    });
  } catch {
    /* monitoring must never break the app */
  }
}
