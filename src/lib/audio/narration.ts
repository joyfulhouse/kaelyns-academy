// src/lib/audio/narration.ts
/**
 * Server-side "make sure a durable clip exists" helper, used by pre-synth-on-
 * generation and the warm-pass script. Best-effort and idempotent: it never
 * throws (callers fire-and-forget), so a failure just costs a later on-demand
 * synth via /api/tts.
 */
import { captureNonCritical } from "@/lib/capture";
import { type Persist, enSpeed, enVoice, prefixFor } from "./config";
import { synthesizeMp3 } from "./kokoro";
import { ttsKey } from "./ttsKey";
import { clipExists, putClip } from "./store";

export interface EnsureNarrationOptions {
  voice?: string;
  speed?: number;
  persist?: Persist;
}

export interface EnsureNarrationResult {
  key: string;
  prefix: string;
  /** True if the clip is durably present after this call (already existed or written). */
  stored: boolean;
}

export async function ensureNarration(
  text: string,
  options: EnsureNarrationOptions = {},
): Promise<EnsureNarrationResult> {
  const voice = options.voice ?? enVoice();
  const speed = options.speed ?? enSpeed();
  const prefix = prefixFor(options.persist);
  const key = ttsKey(text, voice, speed);

  try {
    if (await clipExists(prefix, key)) return { key, prefix, stored: true };
    const bytes = await synthesizeMp3(text, voice, speed);
    const stored = await putClip(prefix, key, bytes);
    return { key, prefix, stored };
  } catch (err) {
    captureNonCritical(`ensureNarration failed for ${prefix}/${key}`, err);
    return { key, prefix, stored: false };
  }
}
