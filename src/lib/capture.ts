import * as Sentry from "@sentry/nextjs";

/** Non-fatal: visible in Sentry as a warning, never alerts, never throws. */
export function captureNonCritical(message: string, error: unknown): void {
  try {
    Sentry.withScope((scope) => {
      scope.setLevel("warning");
      Sentry.captureException(error instanceof Error ? error : new Error(`${message}: ${String(error)}`));
    });
  } catch (err) {
    // Guards only SYNCHRONOUS SDK failures (e.g. the SDK isn't initialised). The
    // async transport send happens after this returns, so a transport-down case
    // can still be silent — this is not a transport-health probe. When it does
    // fire, log the ORIGINAL event alongside the SDK error so context isn't lost.
    console.error("captureNonCritical failed:", err, "| original:", message, error);
  }
}
