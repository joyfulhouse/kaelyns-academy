import { captureNonCritical } from "@/lib/capture";
import { getEnv } from "@/lib/env";

/**
 * Same-origin proxy for pre-generated language audio clips.
 *
 * The hybrid audio layer fetches `/audio/<locale>/<key>.m4a`. In dev those are
 * served statically from `public/audio` (the macOS-`say` generator's output). In
 * prod `public/audio` is empty (gitignored), so this route streams the clip from
 * the object store at `AUDIO_ORIGIN` (a cluster-internal MinIO bucket on pool0).
 * Keeping it same-origin means the storage backend stays private — no public
 * bucket, no extra DNS/tunnel. A miss (unconfigured / not found / upstream error)
 * returns 404 so the client's `useAudio` falls back to locale-aware browser TTS.
 *
 * Build-safe: env + fetch happen per-request, never at module load.
 */
export const dynamic = "force-dynamic";

/** Clip paths are simple `<locale>/<key>.<ext>` segments — nothing else is proxied. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Hostnames that may legitimately be served over plaintext http://. */
function isPrivateHttpHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    // Cluster-internal MinIO (homelab) + reserved test/dev TLDs — never public.
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".svc") ||
    h.endsWith(".cluster.local") ||
    h.endsWith(".test") ||
    // RFC 1918 private ranges (best-effort literal-IP match).
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/**
 * Defense-in-depth SSRF guard on the configured object-store origin (atop the
 * per-segment path guards below). The origin must be an absolute http(s) URL;
 * plaintext http is accepted only for loopback/private/cluster-internal hosts
 * (the homelab serves MinIO cluster-internally over http and dev uses
 * localhost). A `file:`/`gopher:`/public-http origin is a misconfiguration we
 * refuse to fetch from. Returns the normalized base, or `null` when invalid.
 */
function validatedOrigin(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null; // not an absolute URL
  }
  if (url.protocol === "https:") return origin;
  if (url.protocol === "http:" && isPrivateHttpHost(url.hostname)) return origin;
  return null; // wrong scheme, or plaintext http to a public host
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const origin = getEnv("AUDIO_ORIGIN", "").trim().replace(/\/$/, "");
  // Unset is expected (dev / no object store) → 404 so the client falls back to TTS.
  if (!origin) return new Response(null, { status: 404 });
  // Set-but-invalid is a real misconfiguration → fail closed (500), never fetch.
  if (!validatedOrigin(origin)) {
    captureNonCritical(
      "/audio refusing to proxy: AUDIO_ORIGIN is not a valid http(s) origin",
      new Error("invalid AUDIO_ORIGIN"),
    );
    return new Response("Audio origin misconfigured", { status: 500 });
  }

  const { path } = await context.params;
  // Path-traversal / SSRF guard: a clip is at most `<locale>/<key>.<ext>`. Every
  // segment must be a plain name, and `.`/`..` are rejected explicitly (the regex
  // allows dots so `key.m4a` works, which would otherwise let `..` through).
  const unsafe = (seg: string): boolean => !SAFE_SEGMENT.test(seg) || seg === "." || seg === "..";
  if (!path?.length || path.length > 3 || path.some(unsafe)) {
    return new Response(null, { status: 404 });
  }

  const target = `${origin}/${path.map(encodeURIComponent).join("/")}`;
  try {
    const upstream = await fetch(target, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) return new Response(null, { status: 404 });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "audio/mp4",
        // Clips are immutable per key (the id is the audio key), so cache hard.
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
