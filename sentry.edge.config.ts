import * as Sentry from "@sentry/nextjs";

/**
 * Mirror the Node runtime's §8 boundary: oral-reading audio is ephemeral, and
 * Server Action bodies may contain parent PINs, passwords, or child/account
 * data. Never attach incoming bodies, and strip bodies plus cookies again in
 * beforeSend as defense in depth.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    // Edge has no Node httpIntegration. Its supported collection policy is
    // all-default-on once configured, so keep every adjacent PII category
    // explicit while disabling incoming (and all other) HTTP body capture.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false,
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
      frameContextLines: 5,
    },
    beforeSend(event) {
      delete event.request?.data;
      delete event.request?.cookies;
      return event;
    },
  });
}
