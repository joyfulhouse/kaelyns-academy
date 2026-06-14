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

export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const origin = getEnv("AUDIO_ORIGIN", "").trim().replace(/\/$/, "");
  if (!origin) return new Response(null, { status: 404 });

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
