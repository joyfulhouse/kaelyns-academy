import { cn } from "@/lib/cn";
import type { WordProgress } from "./wordType";

/**
 * Word-tile display shared by Word Write and Rocket Race — both show the
 * target word as tiles plus a colored buffer of what's been typed so far.
 * Race keeps this row visible throughout (the race is rate, not memory), so
 * lifting it here (rather than duplicating it) keeps the two Players' tile
 * markup byte-identical.
 */

const TILE_BASE =
  "grid size-14 place-items-center rounded-xl border-[3px] border-ink font-display text-2xl text-ink shadow-pop";
const TILE_TONE: Record<"correct" | "wrong", string> = {
  correct: "bg-honey",
  wrong: "bg-coral/55",
};

function glyph(char: string): string {
  return char === " " ? "␣" : char;
}

/** The (always visible) target — hidden entirely in Player render; only shown
 *  in "see" mode, once a hear-mode round reveals, or always (Rocket Race).
 *  Decorative: the essential text lives in each Player's aria-live announcement. */
export function ExpectedTiles({ item }: { item: string }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap justify-center gap-2">
      {[...item].map((ch, i) => (
        <span key={i} className={cn(TILE_BASE, "bg-paper-raised")}>
          {glyph(ch)}
        </span>
      ))}
    </div>
  );
}

/**
 * §8: `progress.typed` is client-only display feedback. Only `wordItemResult`
 * (expected-derived data) is ever reported — this row is decorative, never the
 * source of what gets sent to `onComplete`.
 */
export function BufferTiles({ progress }: { progress: WordProgress }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap justify-center gap-2">
      {progress.typed.map((entry, i) => (
        <span key={i} className={cn(TILE_BASE, TILE_TONE[entry.ok ? "correct" : "wrong"])}>
          {glyph(entry.char)}
        </span>
      ))}
      <span className="grid size-14 place-items-center rounded-xl border-[3px] border-dashed border-ink/40 bg-paper-sunk text-2xl text-ink/40">
        |
      </span>
    </div>
  );
}
