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

type HeatTier = "none" | "low" | "mid" | "high" | "peak";

/**
 * Static class map — Tailwind's JIT cannot see constructed strings. Every
 * tone reaches >=3:1 against the paper page background and keeps its glyph
 * >=4.5:1 against its own fill (audited against globals.css oklch values:
 * honey 3.08:1/ink 6.07:1, honey-deep 5.53:1/paper 5.53:1, coral 5.13:1/
 * paper 5.13:1, coral-deep 8.60:1/paper 8.60:1). Tiers also step up in
 * font-weight so a colour-blind parent can tell "a lot" from "a little"
 * without relying on hue alone.
 */
const HEAT_TONE: Record<HeatTier, string> = {
  none: "bg-paper-sunk text-ink",
  low: "bg-honey text-ink font-medium",
  mid: "bg-honey-deep text-paper font-semibold",
  high: "bg-coral text-paper font-bold",
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
 * Heat is relative to the worst key IN THIS DATASET, not to attempts — the
 * word-game kinds can prove a key was missed but never that it was attempted
 * (only Key Camp names the expected key), so a miss/attempt ratio would
 * misrepresent the child's typing. Scaling by the dataset's own peak keeps
 * the map readable whether a learner has 3 misses total or 300.
 */
function heatTier(misses: number, peakMisses: number): HeatTier {
  if (misses <= 0) return "none";
  const ratio = misses / peakMisses;
  if (ratio <= 0.25) return "low";
  if (ratio <= 0.5) return "mid";
  if (ratio <= 0.75) return "high";
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
  const peakMisses = Math.max(0, ...cells.map((cell) => cell.misses));

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
                tier={heatTier(cell.misses, peakMisses)}
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
              tier={heatTier(cell.misses, peakMisses)}
              misses={cell.misses}
              attempts={cell.attempts}
            />
          ))}
      </span>
    </div>
  );
}
