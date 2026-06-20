// src/lib/request-ip.ts
/**
 * Best-effort client IP for rate-limiting anonymous callers.
 *
 * The public domain is fronted by a Cloudflare Tunnel, which sets and sanitizes
 * `cf-connecting-ip` (a client cannot forge it — Cloudflare overwrites any
 * client-supplied value), so it is the trustworthy source for the abuse vector
 * we actually gate: external traffic via `kaelyns.academy`. `x-real-ip` and the
 * first `x-forwarded-for` hop are fallbacks for non-Cloudflare (in-cluster) paths
 * and ARE client-spoofable — acceptable because anonymous external abuse always
 * carries `cf-connecting-ip`. Returns `null` when no IP can be determined; callers
 * should bucket those together rather than skip the limit.
 */
export function clientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;

  return null;
}
