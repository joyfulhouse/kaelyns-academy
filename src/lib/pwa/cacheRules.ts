// Pure predicates for service-worker runtime caching. Kept out of sw.ts so they are
// unit-testable without a worker/DOM environment. Imported by sw.ts via a RELATIVE
// path (esbuild bundles the worker and may not resolve the "@/" tsconfig alias).

/** Same-origin pre-generated audio clip GET (`/audio/<locale>/<key>.<ext>`). */
export function isAudioRequest(url: URL, sameOrigin: boolean): boolean {
  return sameOrigin && url.pathname.startsWith("/audio/");
}
