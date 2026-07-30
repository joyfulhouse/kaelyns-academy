interface KeyMissPoint {
  key: string;
  misses: number;
  attempts: number;
}

interface KeysToPracticeProps {
  misses: readonly KeyMissPoint[];
}

/** A sensible cap so a struggling week doesn't turn into a long, discouraging
 *  scroll of letters — the remaining count is disclosed instead of hidden. */
const MAX_LISTED = 8;

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

function keyGlyph(char: string): string {
  return char === " " ? "Space" : char.toUpperCase();
}

function summaryLabel(ranked: readonly { char: string; misses: number }[]): string {
  const names = ranked.slice(0, 3).map((entry) => keyName(entry.char));
  return `Keys to practice, ranked by miss count: ${names.join(", ")}.`;
}

/**
 * Parent-only ranked list of the keys most often missed. Replaces the earlier
 * keyboard-shaped heat map (three independent reviewers found six defects in
 * it: card overflow hiding real keys, threshold saturation, hover-only
 * counts, phone-sized glyphs, a ratio-shaped tooltip, and a false empty
 * state) — a plain ranked list keeps every count as real, visible DOM text
 * instead of relying on colour or a title attribute.
 *
 * Misses are an ABSOLUTE COUNT, never a rate: `attempts` only ever accrues
 * from Key Camp prompts (the only kind that names the key being attempted),
 * so a key can legitimately show misses with no known attempt count. This
 * widget therefore never prints `attempts` at all — pairing "5 misses" next
 * to "1 tracked attempt" reads as a ratio the product deliberately refuses to
 * compute.
 *
 * Two properties the heat map got right are preserved by design, not by
 * accident — do not regress either while editing this component:
 *  1. The exact count is never lost: every listed key's miss count renders
 *     as real, unconditional DOM text (not a `title`, not hover-only) — the
 *     replacement's whole point.
 *  2. Severity is never carried by colour alone: every badge shares
 *     identical styling regardless of rank — only descending order plus the
 *     printed count communicate degree, so nothing is lost for a colour-blind
 *     parent and no heat-tier colour ramp should ever be reintroduced here.
 *     The uniform badge fill is `ink` (a calm, neutral chip), not
 *     `coral-deep` — that token was the heat map's retired peak-alarm tier,
 *     and a single miss on one key shouldn't read as maximally alarming.
 */
export function KeysToPractice({ misses }: KeysToPracticeProps) {
  const byKey = new Map<string, number>();
  for (const point of misses) {
    const lower = point.key.toLowerCase();
    byKey.set(lower, (byKey.get(lower) ?? 0) + point.misses);
  }

  const ranked = [...byKey.entries()]
    .map(([char, total]) => ({ char, misses: total }))
    .filter((entry) => entry.misses > 0)
    .sort((a, b) => b.misses - a.misses);

  if (ranked.length === 0) {
    return (
      <div className="rounded-lg bg-paper-sunk/50 px-5 py-6 text-center">
        <p className="font-medium text-ink-soft">No missed keys recorded yet.</p>
        <p className="mt-1 text-sm text-ink-faint">
          Missed keys will show up here once any come up — an empty list just means nothing has
          been missed yet, not that she hasn&rsquo;t practiced.
        </p>
      </div>
    );
  }

  const shown = ranked.slice(0, MAX_LISTED);
  const truncatedCount = ranked.length - shown.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-sm font-semibold text-ink">Keys to practice</p>
      <ol aria-label={summaryLabel(shown)} className="flex flex-col gap-1.5">
        {shown.map((entry) => (
          <li
            key={entry.char}
            className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper-sunk/40 px-3 py-2"
          >
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-7 w-auto min-w-7 shrink-0 place-items-center rounded-sm border-2 border-ink bg-ink px-1.5 text-sm font-black text-paper"
              >
                {keyGlyph(entry.char)}
              </span>
              <span className="sr-only">{keyName(entry.char)}</span>
            </span>
            <span className="text-sm text-ink-soft">
              {entry.misses} {entry.misses === 1 ? "miss" : "misses"}
            </span>
          </li>
        ))}
      </ol>
      {truncatedCount > 0 && (
        <p className="text-xs text-ink-faint">
          Showing the top {MAX_LISTED} of {ranked.length} keys.
        </p>
      )}
      <p className="text-xs text-ink-faint">
        Counted from the last 200 typing rounds. Misses only — not a percentage.
      </p>
    </div>
  );
}
