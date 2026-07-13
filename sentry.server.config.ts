import * as Sentry from "@sentry/nextjs";

/**
 * Child audio transits /api/oral-reading as a multipart body (§8: processed
 * in-memory, discarded, never retained). Sentry's HTTP integration defaults to
 * attaching up to 10KB of incoming request body to error events, which would
 * persist recording bytes on any captured failure — so body capture is
 * disabled for that route, with a beforeSend strip as defense in depth.
 */
const AUDIO_ROUTE = "/api/oral-reading";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequestBody: (url) => url.includes(AUDIO_ROUTE),
      }),
    ],
    beforeSend(event) {
      if (event.request?.url?.includes(AUDIO_ROUTE)) {
        delete event.request.data;
      }
      return event;
    },
  });
}
