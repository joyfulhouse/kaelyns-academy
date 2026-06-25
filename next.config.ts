import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withSerwist } from "@serwist/turbopack";
import { SERWIST_CACHE_CONTROL, SERWIST_ROUTE_SOURCE } from "./src/lib/pwa/precache";

// Stable across replicas, busts per deploy, needs no runtime git: CI sets SOURCE_COMMIT
// (the pinned image SHA); locally we fall back to a per-build timestamp. next.config runs
// once per build in Node, so Date.now() here is a build stamp, not a per-request value.
const BUILD_REV = process.env.SOURCE_COMMIT || process.env.GIT_SHA || String(Date.now());

// ── Content-Security-Policy ──────────────────────────────────────────────────
// The browser Sentry SDK POSTs error/replay envelopes to its DSN's ingest host
// (e.g. https://oXXX.ingest.us.sentry.io). The host is environment-specific and
// only known at runtime via NEXT_PUBLIC_SENTRY_DSN, so we derive its origin here
// (next.config runs in Node at build, where NEXT_PUBLIC_* env is already present)
// and add it to connect-src. If the DSN is unset (e.g. dev), Sentry never inits,
// so connect-src 'self' is sufficient and we add nothing — keeping the policy
// tight rather than blanket-allowing an ingest wildcard.
function sentryIngestOrigin(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null; // malformed DSN → Sentry won't post anywhere useful; allow nothing
  }
}

// Enforcing CSP (NOT Report-Only). Each source is the minimum the app needs:
// - default-src 'self'          everything not otherwise listed stays same-origin
// - base-uri 'self'             block <base> tag hijacking of relative URLs
// - object-src 'none'           no <object>/<embed> (legacy plugin XSS surface)
// - frame-ancestors 'none'      no embedding (clickjacking); pairs with X-Frame-Options
// - form-action 'self'          forms (Better Auth sign-in) post same-origin only
// - img-src 'self' data: blob:  app art + inlined data: icons + blob: (canvas/SW)
// - font-src 'self' data:       next/font self-hosts the font files; data: for inlined glyphs
// - style-src 'self' 'unsafe-inline'   Tailwind/Next inject inline <style>; no nonce middleware
// - script-src 'self' 'unsafe-inline'  Next 16 hydration + serwist registration use inline
//                                bootstrap; we accept 'unsafe-inline' over adding nonce middleware
// - worker-src 'self' blob:     the serwist service worker registers from a blob: URL
// - manifest-src 'self'         the PWA manifest is same-origin
// - connect-src 'self' <sentry> fetch/XHR/beacon: same-origin (incl. the /audio proxy &
//                                on-demand /api/tts, both same-origin) plus the Sentry ingest host
// - media-src 'self'            audio clips are played from the same-origin /audio proxy
//                                (NEXT_PUBLIC_AUDIO_BASE_URL defaults to /audio); the MinIO
//                                backend is reached server-side by the proxy, never by the browser,
//                                so no object-store host is needed here
function contentSecurityPolicy(): string {
  const sentry = sentryIngestOrigin();
  const connect = ["'self'", sentry].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `connect-src ${connect}`,
    "media-src 'self'",
  ].join("; ");
}

// Baseline security headers applied to every response. Kept separate from the
// serwist Cache-Control entry below (which targets only the /serwist/* route).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: { "*": ["./_archive/**"] },
  env: { NEXT_PUBLIC_BUILD_SHA: BUILD_REV },
  // The /serwist/* route is `force-static`, which makes Next serve it with a 1-year CDN
  // cache (s-maxage=31536000). A stale/bad service worker must never be sticky at the
  // edge for a year, so override Cache-Control to revalidate every fetch. (Policy +
  // rationale live in src/lib/pwa/precache.ts so the route and config share one source.)
  async headers() {
    return [
      // Security baseline + enforcing CSP on every route.
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: SERWIST_ROUTE_SOURCE,
        headers: [{ key: "Cache-Control", value: SERWIST_CACHE_CONTROL }],
      },
    ];
  },
};

export default withSerwist(
  withSentryConfig(nextConfig, {
    silent: !process.env.CI,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  }),
);
