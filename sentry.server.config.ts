import * as Sentry from "@sentry/nextjs";

/**
 * Child audio transits /api/oral-reading as a multipart body (§8: processed
 * in-memory, discarded, never retained). Sentry's HTTP integration defaults to
 * attaching up to 10KB of incoming request body to error events, which would
 * persist recording bytes on any captured failure. Next.js Server Action bodies
 * can likewise contain parent PINs, passwords, or other account/child data, so
 * incoming body capture is disabled globally. beforeSend also strips bodies and
 * cookies from every event as defense in depth.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequestBody: () => true,
      }),
    ],
    beforeSend(event) {
      delete event.request?.data;
      delete event.request?.cookies;
      return event;
    },
  });
}
