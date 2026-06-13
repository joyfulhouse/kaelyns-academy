import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "*": ["./_archive/**"] },
};

export default withSentryConfig(nextConfig, {
  // Suppress build output unless running in CI
  silent: !process.env.CI,
  // Disable source map upload when no auth token — keeps no-DSN builds clean
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
