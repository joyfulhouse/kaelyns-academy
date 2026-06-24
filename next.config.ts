import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withSerwist } from "@serwist/turbopack";
import { SERWIST_CACHE_CONTROL, SERWIST_ROUTE_SOURCE } from "./src/lib/pwa/precache";

// Stable across replicas, busts per deploy, needs no runtime git: CI sets SOURCE_COMMIT
// (the pinned image SHA); locally we fall back to a per-build timestamp. next.config runs
// once per build in Node, so Date.now() here is a build stamp, not a per-request value.
const BUILD_REV = process.env.SOURCE_COMMIT || process.env.GIT_SHA || String(Date.now());

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
