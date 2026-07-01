// src/lib/audio/spokenFields.ts
/**
 * Which English strings in a generated activity config are read aloud to the
 * child. Used to pre-synthesize narration right after generation so the speaker
 * button is an instant cache hit. Foreign (`lang-*`) configs are handled by the
 * pre-generated clip pipeline and are intentionally NOT covered here.
 */
import { tilePhonemeText, wordPhonemeText } from "./phonemes";
import { normalizeText } from "./ttsKey";

/** Ordered, de-duplicated, non-blank spoken strings for one config item. */
export function spokenEnglishStrings(item: unknown): string[] {
  if (!item || typeof item !== "object") return [];
  const r = item as Record<string, unknown>;
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };

  push(r.instruction);
  push(r.prompt); // journal-prompt
  push(r.passage); // reading-comprehension
  if (Array.isArray(r.questions)) {
    for (const q of r.questions) {
      if (q && typeof q === "object") push((q as Record<string, unknown>).prompt);
    }
  }
  push(r.retellPrompt);
  if (Array.isArray(r.words)) {
    for (const w of r.words) {
      if (typeof w === "string") {
        push(w); // sightword-game targets
      } else if (w && typeof w === "object") {
        // phonics-wordbuild words: spoken whole, with an optional IPA override.
        const wo = w as Record<string, unknown>;
        const word = typeof wo.word === "string" ? wo.word : "";
        if (word) push(wordPhonemeText(word, wo.ipa) ?? word);
      }
    }
  }
  // phonics-wordbuild tiles: each is spoken in isolation when tapped, so warm the
  // SAME string the Player sends — its phoneme override when authored, else bare.
  // Silent tiles (e.g. the magic-e) make no sound, so there's nothing to warm.
  if (Array.isArray(r.tiles)) {
    const say = r.say && typeof r.say === "object" ? (r.say as Record<string, string>) : undefined;
    const silent = Array.isArray(r.silent)
      ? new Set(r.silent.filter((x): x is string => typeof x === "string"))
      : undefined;
    for (const t of r.tiles) {
      if (typeof t !== "string" || silent?.has(t)) continue;
      push(tilePhonemeText(t, say) ?? t);
    }
  }

  // Stable de-dup (first occurrence wins).
  return [...new Set(out)];
}

/** Hard ceiling on durable narration warm-ups enqueued for ONE generated batch.
 *  Generation is capped at 8 items, so a normal batch warms well under this; the
 *  cap only bites on adversarial max-size configs, bounding the fire-and-forget
 *  synth burst (which bypasses the /api/tts rate limit). */
const PREWARM_MAX = 128;

/** The deduped, hard-capped list of strings to pre-warm for a batch of generated
 *  activity configs. Bounds fan-out so one /api/practice response can't enqueue an
 *  unbounded burst of durable Kokoro/MinIO synths. */
export function prewarmTexts(items: readonly unknown[], cap: number = PREWARM_MAX): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const text of spokenEnglishStrings(item)) {
      // Dedupe by the SAME normalized identity ttsKey hashes, so whitespace
      // variants (" cat", "cat\n") collapse to one warm call, not several.
      const id = normalizeText(text);
      if (seen.has(id)) continue;
      if (out.length >= cap) return out;
      seen.add(id);
      out.push(text);
    }
  }
  return out;
}
