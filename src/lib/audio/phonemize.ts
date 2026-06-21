// src/lib/audio/phonemize.ts
// server-only: this module must never be imported into a Client Component.
// (the `server-only` package isn't installed; this comment is the guard, and the
//  only caller is the server-side practice generator.)
/**
 * Thin client for kokoro-fastapi's grapheme→phoneme dev endpoint. Returns the
 * word's REAL misaki phonemes so {@link import("./phonemeCheck").plausibleOverride}
 * can drop an AI-hallucinated tile override (→ bare fallback). Fail-soft: any
 * error/timeout returns `null` and the caller keeps the override (fail-open —
 * sanitization + length/array caps still protect).
 *
 * NOTE: `/dev/phonemize` lives at the SERVER ROOT, not under `/v1`. KOKORO_URL is
 * the OpenAI-compatible base (".../v1"), so we strip a trailing `/v1` to get the
 * root and call `${root}/dev/phonemize`.
 */
import { getEnv } from "@/lib/env";

const PHONEMIZE_TIMEOUT_MS = 10_000;

/** Map `text` to its misaki phoneme string via Kokoro, or `null` on any failure. */
export async function phonemize(text: string): Promise<string | null> {
  try {
    const base = getEnv("KOKORO_URL", "http://localhost:8880/v1").replace(/\/$/, "");
    const root = base.replace(/\/v1$/, "");
    const res = await fetch(`${root}/dev/phonemize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, language: "a" }),
      signal: AbortSignal.timeout(PHONEMIZE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const phonemes = (data as { phonemes?: unknown }).phonemes;
    return typeof phonemes === "string" ? phonemes : null;
  } catch {
    return null;
  }
}
