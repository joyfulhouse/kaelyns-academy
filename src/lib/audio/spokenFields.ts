// src/lib/audio/spokenFields.ts
/**
 * Which English strings in a generated activity config are read aloud to the
 * child. Used to pre-synthesize narration right after generation so the speaker
 * button is an instant cache hit. Foreign (`lang-*`) configs are handled by the
 * pre-generated clip pipeline and are intentionally NOT covered here.
 */

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
  if (Array.isArray(r.words)) for (const w of r.words) push(w); // sightword-game targets

  // Stable de-dup (first occurrence wins).
  return [...new Set(out)];
}
