// src/lib/audio/narration.ts
/**
 * Server-side "make sure a durable clip exists" helper, used by pre-synth-on-
 * generation and the warm-pass script. Best-effort and idempotent: it never
 * throws (callers fire-and-forget), so a failure just costs a later on-demand
 * synth via /api/tts.
 */
import { captureNonCritical } from "@/lib/capture";
import { MAX_TTS_TEXT_LEN, type Persist, enSpeed, enVoice, prefixFor } from "./config";
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

/** Dedupe concurrent identical synths within a process so a warm burst (or two
 *  overlapping requests) collapses to one Kokoro call + write, not several. */
const inflight = new Map<string, Promise<EnsureNarrationResult>>();

export async function ensureNarration(
  text: string,
  options: EnsureNarrationOptions = {},
): Promise<EnsureNarrationResult> {
  const voice = options.voice ?? enVoice();
  const speed = options.speed ?? enSpeed();
  const prefix = prefixFor(options.persist);
  const key = ttsKey(text, voice, speed);

  // Mirror the /api/tts guard: never synthesize (or cache) oversized text. The
  // runtime route rejects anything past this, so warming it is wasted spend — and
  // it caps denial-of-wallet via pre-synth of AI-generated configs.
  if (text.trim().length > MAX_TTS_TEXT_LEN) return { key, prefix, stored: false };

  // Collapse concurrent identical synths so one clip isn't synthesized/written twice.
  const dedupeKey = `${prefix}/${key}`;
  const running = inflight.get(dedupeKey);
  if (running) return running;
  const task = synthAndStore(text, voice, speed, prefix, key);
  inflight.set(dedupeKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(dedupeKey);
  }
}

async function synthAndStore(
  text: string,
  voice: string,
  speed: number,
  prefix: string,
  key: string,
): Promise<EnsureNarrationResult> {
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
