// src/lib/audio/ttsKey.ts
/** Content-addressed key for a narration clip. Server-only (node crypto). */
import { createHash } from "node:crypto";

/** Trim + collapse internal whitespace so spacing differences dedupe. Case and
 *  punctuation are preserved because they change prosody. */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** sha256 of `<normalized>|<voice>|<speed>` as lowercase hex. */
export function ttsKey(text: string, voice: string, speed: number): string {
  const payload = `${normalizeText(text)}|${voice}|${speed}`;
  return createHash("sha256").update(payload).digest("hex");
}
