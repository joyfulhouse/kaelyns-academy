import * as Sentry from "@sentry/nextjs";

/** Non-fatal: visible in Sentry as a warning, never alerts, never throws. */
export function captureNonCritical(message: string, error: unknown): void {
  try {
    Sentry.withScope((scope) => {
      scope.setLevel("warning");
      Sentry.captureException(error instanceof Error ? error : new Error(`${message}: ${String(error)}`));
    });
  } catch (err) {
    // Monitoring must never break the app, but a swallowed Sentry-send failure
    // makes monitoring-down invisible. Surface it on stderr (still non-throwing)
    // so the original event and the send failure both leave a trace.
    console.error("captureNonCritical failed:", err);
  }
}
