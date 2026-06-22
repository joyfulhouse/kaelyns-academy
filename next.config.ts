import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withSerwist } from "@serwist/turbopack";

// Stable across replicas, busts per deploy, needs no runtime git: CI sets SOURCE_COMMIT
// (the pinned image SHA); locally we fall back to a per-build timestamp. next.config runs
// once per build in Node, so Date.now() here is a build stamp, not a per-request value.
const BUILD_REV = process.env.SOURCE_COMMIT || process.env.GIT_SHA || String(Date.now());

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: { "*": ["./_archive/**"] },
  env: { NEXT_PUBLIC_BUILD_SHA: BUILD_REV },
};

export default withSerwist(
  withSentryConfig(nextConfig, {
    silent: !process.env.CI,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  }),
);
