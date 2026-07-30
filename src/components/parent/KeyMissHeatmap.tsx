import { cn } from "@/lib/cn";
import { TYPING_ROWS } from "@/activities/_shared/typing/keys";

interface KeyMissHeatmapPoint {
  key: string;
  misses: number;
  attempts: number;
}

interface KeyMissHeatmapProps {
  misses: readonly KeyMissHeatmapPoint[];
}

const ROW_ORDER = ["top", "home", "bottom"] as const;
const ROW_PADDING: Record<(typeof ROW_ORDER)[number], string> = {
  top: "pl-0",
  home: "pl-3",
  bottom: "pl-6",
};

type HeatTier = "none" | "low" | "mid" | "peak";

/**
 * Static class map — Tailwind's JIT cannot see constructed strings. Four
 * tiers, not five: `honey-deep` was dropped after an adjacent-tier audit
 * found honey-deep/coral only 1.23:1 apart on lightness alone, below the
 * 1.3:1 bar every other step clears. Every remaining tone keeps its glyph
 * >=4.5:1 against its own fill, AND is now >=1.3:1 apart from its
 * neighbours on the ladder — verified with a spec-validated OKLCH ->
 * linear-sRGB -> WCAG-relative-luminance implementation (canonical check:
 * oklch(62.8% 0.25768 29.23) round-trips to srgb 255,0,0): glyphs
 * ink/honey 8.24:1, ink/coral 4.66:1, paper/coral-deep 4.88:1; adjacent
 * fills paper-sunk/honey 1.56:1, honey/coral 1.77:1, coral/coral-deep
 * 1.51:1. Fill-to-page contrast against the paper background is NOT
 * uniformly >=3:1 (honey/paper is only 1.82:1) — every cell also carries
 * `border-2 border-ink`, so the boundary is drawn regardless of that
 * delta. Ink reads on the two lighter tiers; only the deepest tier is dark
 * enough to need paper-coloured text — paper on honey (1.82:1) and paper
 * on coral (3.22:1) both fail 4.5:1 and must never be used. Tiers also
 * step up in font-weight so a colour-blind parent can tell "a lot" from
 * "a little" without relying on hue alone.
 */
const HEAT_TONE: Record<HeatTier, string> = {
  none: "bg-paper-sunk text-ink",
  low: "bg-honey text-ink font-medium",
  mid: "bg-coral text-ink font-bold",
  peak: "bg-coral-deep text-paper font-black",
};

const PUNCTUATION_NAME: Record<string, string> = {
  ",": "comma",
  ".": "period",
  "/": "slash",
  ";": "semicolon",
};

function keyName(char: string): string {
  if (char === " ") return "space bar";
  return PUNCTUATION_NAME[char] ?? char.toUpperCase();
}

/**
 * Fixed absolute thresholds, NOT scaled to this dataset's own peak — the
 * colour has to mean the same thing every time a parent looks, and across
 * siblings. A child who missed one key twice and nothing else must read as
 * nearly cool, not the same alarming deep-coral as a child struggling badly.
 * Cut points are tuned for a young typist's practice volume (a session is a
 * handful of prompts, not hundreds): 1-2 misses is an ordinary slip, 6+ is
 * already the actionable signal for a key worth a parent's attention — the
 * exact count is never lost, it stays in the cell title and the container's
 * aria-label regardless of which tier it lands in.
 */
function heatTier(misses: number): HeatTier {
  if (misses <= 0) return "none";
  if (misses <= 2) return "low";
  if (misses <= 5) return "mid";
  return "peak";
}

function heatmapLabel(cells: readonly { char: string; misses: number }[]): string {
  const missed = cells.filter((cell) => cell.misses > 0).sort((a, b) => b.misses - a.misses);
  if (missed.length === 0) {
    return `Keyboard heat map: ${cells.length} keys, no misses recorded.`;
  }
  const names = missed.slice(0, 3).map((cell) => keyName(cell.char));
  return `Keyboard heat map: ${cells.length} keys, most missed are ${names.join(", ")}.`;
}

function Cell({
  char,
  tier,
  misses,
  attempts,
}: {
  char: string;
  tier: HeatTier;
  misses: number;
  attempts: number;
}) {
  const missWord = misses === 1 ? "miss" : "misses";
  const attemptNote =
    attempts > 0 ? `, ${attempts} tracked attempt${attempts === 1 ? "" : "s"}` : "";

  return (
    <span
      aria-hidden="true"
      data-key={char}
      data-heat={tier}
      title={`${keyName(char)}: ${misses} ${missWord}${attemptNote}`}
      className={cn(
        "typing-key grid place-items-center rounded-sm border-2 border-ink",
        char === " " && "typing-key-space",
        HEAT_TONE[tier],
      )}
    >
      {char === " " ? "" : char}
    </span>
  );
}

/**
 * Parent-only key-miss heatmap. Heat is an ABSOLUTE MISS COUNT, never a
 * rate: `attempts` only accrues from Key Camp prompts (the only kind that
 * names the key being attempted), so a key can legitimately show
 * `misses > 0, attempts: 0`. Dividing misses by attempts would divide by a
 * denominator that does not exist for three of the four typing kinds.
 */
export function KeyMissHeatmap({ misses }: KeyMissHeatmapProps) {
  if (misses.length === 0) {
    return (
      <div className="rounded-lg bg-paper-sunk/50 px-5 py-6 text-center">
        <p className="font-medium text-ink-soft">No Key Camp practice yet</p>
        <p className="mt-1 text-sm text-ink-faint">
          Missed keys will show up here after a few typing sessions.
        </p>
      </div>
    );
  }

  const byKey = new Map(misses.map((point) => [point.key.toLowerCase(), point]));
  const lookup = (char: string) => byKey.get(char.toLowerCase()) ?? { misses: 0, attempts: 0 };
  const cells = [
    ...ROW_ORDER.flatMap((row) => TYPING_ROWS[row].map((char) => ({ row, char }))),
    { row: "space" as const, char: " " },
  ].map(({ row, char }) => ({ row, char, ...lookup(char) }));

  return (
    <div
      className="typing-keyboard flex w-fit max-w-full flex-col items-start gap-2"
      role="img"
      aria-label={heatmapLabel(cells)}
    >
      {ROW_ORDER.map((row) => (
        <div key={row} className={cn("typing-keyboard-row flex", ROW_PADDING[row])}>
          {cells
            .filter((cell) => cell.row === row)
            .map((cell) => (
              <Cell
                key={cell.char}
                char={cell.char}
                tier={heatTier(cell.misses)}
                misses={cell.misses}
                attempts={cell.attempts}
              />
            ))}
        </div>
      ))}
      <span className="self-center">
        {cells
          .filter((cell) => cell.row === "space")
          .map((cell) => (
            <Cell
              key={cell.char}
              char={cell.char}
              tier={heatTier(cell.misses)}
              misses={cell.misses}
              attempts={cell.attempts}
            />
          ))}
      </span>
    </div>
  );
}
