import { createSerwistRoute } from "@serwist/turbopack";
import { PRECACHE_GLOB_PATTERNS } from "@/lib/pwa/precache";

// Precache revision comes from the build (no runtime `git`). See next.config.ts.
const revision = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    // Lean precache: this glob covers ONLY stable public/ assets (icons, svgs) — no
    // content-hashed /_next chunks — so an atomic precache install can't fail on a
    // missing chunk (see PRECACHE_GLOB_PATTERNS). Hashed /_next assets are cached at
    // runtime via the CacheFirst rule in sw.ts. The /~offline document is precached
    // separately via additionalPrecacheEntries below.
    globPatterns: [...PRECACHE_GLOB_PATTERNS],
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
