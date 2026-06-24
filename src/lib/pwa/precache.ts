// Pure, dependency-free service-worker hardening config shared by `next.config.ts`
// (header policy) and the Serwist route handler (precache globs). Kept here so both
// the build config and the route consume one source of truth, and so the policy is
// unit-testable without importing Next internals or a worker/DOM environment.

/**
 * Glob patterns for what Serwist PRECACHES (relative to the project root). Passing
 * this OVERRIDES Serwist's default globs (which include `<distDir>static/**`); we
 * include ONLY `public/**` (stable icons/svgs) so NO content-hashed `/_next` build
 * chunk is ever precached.
 *
 * Why: Serwist precaching is atomic — a single non-200 precached URL (a stale
 * edge-cached SW mid-rollout, or a brief divergent-replica window) rejects the whole
 * `install`, so the SW never activates. Hashed `/_next/static` assets are still cached
 * at RUNTIME on demand via the CacheFirst rule in `sw.ts`; only PRECACHING them is
 * dropped.
 *
 * Offline scope: the `/~offline` fallback document is precached separately via the
 * route's `additionalPrecacheEntries` (NOT this glob). That page is a server
 * component — it renders to static HTML with no client JS — so it paints offline
 * without any `/_next` chunk. Deep routes are best-effort offline (served only if
 * their hashed assets were already runtime-cached on a prior online visit); that is
 * an accepted trade for an `install` that can never fail on a missing chunk.
 */
export const PRECACHE_GLOB_PATTERNS = ["public/**/*"] as const;

/** Path source (Next `headers()` matcher) for the Serwist-served SW + assets. */
export const SERWIST_ROUTE_SOURCE = "/serwist/:path*";

/**
 * Cache-Control for `/serwist/*` (the SW script + its sourcemap).
 *
 * The route is `force-static`, which otherwise makes Next serve it with a 1-year CDN
 * cache (`s-maxage=31536000`) — a bad service worker could then stay pinned at the
 * edge for up to a year. This forces revalidation on every fetch.
 *
 * NOTE — this is only the ORIGIN half of the fix. It governs FUTURE edge fetches; an
 * entry already cached under the old 1-year TTL must be PURGED once at the CDN to
 * evict it, and any Cloudflare "cache everything" / edge-TTL override rule must be set
 * to honor origin headers. The script is tiny and the browser still byte-caches it
 * under its own SW-update rules; this only stops long-lived CDN pinning so a bad SW
 * can recover on the next deploy.
 */
export const SERWIST_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/**
 * True if `globPatterns` can never precache a content-hashed `/_next` build chunk.
 * Rejects any pattern referencing the Next build output — `_next`/`.next` (covers
 * `.next/static`, `.next/server`) or a `static/` path segment — i.e. the globs that
 * pulled every hashed chunk into the fragile atomic precache.
 */
export function precacheExcludesNextChunks(globPatterns: readonly string[]): boolean {
  return !globPatterns.some(
    (p) => p.includes("_next") || p.includes(".next") || /(^|\/)static\//.test(p),
  );
}
