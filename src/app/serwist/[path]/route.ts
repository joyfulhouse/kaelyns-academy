import { createSerwistRoute } from "@serwist/turbopack";

// Precache revision comes from the build (no runtime `git`). See next.config.ts.
const revision = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
