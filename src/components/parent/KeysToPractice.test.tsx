import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KeysToPractice } from "./KeysToPractice";

const MISSES = [
  { key: "l", misses: 12, attempts: 0 },
  { key: "j", misses: 9, attempts: 0 },
  { key: "s", misses: 6, attempts: 10 },
  { key: "q", misses: 0, attempts: 12 },
];

describe("KeysToPractice", () => {
  it("ranks keys by miss count descending", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    const order = [...html.matchAll(/(\d+) misses?/g)].map((m) => Number(m[1]));
    expect(order).toEqual([12, 9, 6]);
  });

  it("shows only keys with at least one miss", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).not.toContain(">Q<");
    expect(html).not.toContain("0 misses");
  });

  it("renders miss counts as real DOM text, not a title attribute", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).toContain("12 misses");
    expect(html).toContain("9 misses");
    expect(html).toContain("6 misses");
    expect(html).not.toMatch(/title="/);
  });

  /**
   * Round-3 honesty fix: `getTypingMissHistory`'s 200-row limit applies to the
   * last 200 ATTEMPTS filtered to the four typing kinds, not to "activities"
   * broadly — a parent reading "activities" would reasonably assume it counts
   * reading/math too. "typing rounds" says exactly what's counted.
   */
  it("discloses the reader window as typing rounds, not activities broadly, and that counts are misses, not a percentage", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).toContain("last 200 typing rounds");
    expect(html).not.toContain("last 200 activities");
    expect(html).toMatch(/not a percentage/i);
  });

  it("never prints attempts next to misses (no ratio-shaped reading)", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).not.toContain("tracked attempt");
    expect(html).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it("renders a truthful empty state when there is no data", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={[]} />);
    expect(html).toContain("No missed keys recorded yet.");
    expect(html).not.toContain("No typing practice yet");
  });

  it("renders the same truthful empty state when every point has zero misses (a perfect week, not 'no practice')", () => {
    const html = renderToStaticMarkup(
      <KeysToPractice misses={[{ key: "a", misses: 0, attempts: 5 }]} />,
    );
    expect(html).toContain("No missed keys recorded yet.");
  });

  /**
   * Round-3 copy fix: the subcopy previously read "after a few typing
   * sessions", which reads as "no practice yet" — wrong for a child who HAS
   * practiced (Star-Catch-only, which tracks no misses at all, or a perfect
   * Key Camp week with zero misses). The headline was already accurate; the
   * subcopy must land the same "nothing missed", not "no practice", claim.
   */
  it("phrases the empty-state subcopy as 'nothing missed yet', not 'no practice yet'", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={[]} />);
    expect(html).not.toMatch(/after a few typing sessions/i);
    expect(html).toMatch(/nothing.*missed yet/i);
  });

  it("never renders a child's display name", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).not.toContain("Kaelyn");
  });

  it("sums misses across case variants of the same physical key regardless of array order", () => {
    const mixedCase = [
      { key: "f", misses: 4, attempts: 0 },
      { key: "F", misses: 1, attempts: 0 },
    ];
    const forward = renderToStaticMarkup(<KeysToPractice misses={mixedCase} />);
    const reversed = renderToStaticMarkup(<KeysToPractice misses={[...mixedCase].reverse()} />);

    expect(forward).toContain("5 misses");
    expect(forward).toBe(reversed);
  });

  it("caps the list and discloses truncation when there are more missed keys than the cap", () => {
    const many = "abcdefghij".split("").map((key, i) => ({
      key,
      misses: 10 - i,
      attempts: 0,
    }));
    const html = renderToStaticMarkup(<KeysToPractice misses={many} />);

    expect(html).toContain(">A<");
    expect(html).toContain(">H<");
    expect(html).not.toContain(">I<");
    expect(html).not.toContain(">J<");
    expect(html).toMatch(/Showing the top 8 of 10 keys/);
  });

  it("does not disclose truncation when every missed key fits within the cap", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).not.toMatch(/Showing the top/);
  });

  function listItems(html: string): string[] {
    return html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
  }

  // Design-audit addendum: the heat map kept the exact count alive in the
  // cell title + container aria-label no matter which tier a key landed in.
  // A ranked list must keep that same guarantee from the other direction —
  // every ROW carries its OWN count, not just "the count appears somewhere
  // on the page" (which a summary line alone could satisfy without binding
  // count to key).
  it("binds each listed key's own count to its own row, not merely somewhere on the page", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    const rows = listItems(html);
    expect(rows).toHaveLength(3);

    const lRow = rows.find((row) => row.includes(">L<"));
    const jRow = rows.find((row) => row.includes(">J<"));
    const sRow = rows.find((row) => row.includes(">S<"));
    expect(lRow).toContain("12 misses");
    expect(jRow).toContain("9 misses");
    expect(sRow).toContain("6 misses");
  });

  // Design-audit addendum: the heat map stepped font-weight alongside colour
  // (400 → 500 → 700 → 900) so severity was never carried by hue alone. This
  // list uses no colour-coded severity signal at all — every row's badge is
  // styled identically regardless of rank; only order + the printed count
  // communicate degree. Guard against ever reintroducing a heat-tier ramp.
  it("never encodes severity via colour: every row's key badge is styled identically regardless of rank", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    const rows = listItems(html);
    const badgeClass = (row: string) => row.match(/<span aria-hidden[^>]*class="([^"]*)"/)?.[1];

    const classes = rows.map(badgeClass);
    expect(classes.every((c) => c !== undefined)).toBe(true);
    expect(new Set(classes).size).toBe(1); // identical across the highest- and lowest-ranked rows
  });

  /**
   * Round-3 layout fix: `keyGlyph(" ")` renders the word "Space" (5 chars) —
   * a fixed `size-7` (28px) square badge measured `scrollWidth` 44 vs
   * `clientWidth` 24, a 20px overspill with no `overflow:hidden` to clip it,
   * breaking the uniform badge grid. Reachable in practice: `ww-sentences`
   * ships "The fat cat sat.", and `pressWordKey` records `expected[pos]`
   * (including a literal space) into `missedExpected` at divergence, so " "
   * genuinely enters the tally and can rank into the top eight.
   */
  it("lets the space-bar badge grow to fit 'Space' instead of the fixed size-7 square overflowing", () => {
    const withSpace = [
      { key: " ", misses: 8, attempts: 0 },
      { key: "f", misses: 5, attempts: 0 },
    ];
    const html = renderToStaticMarkup(<KeysToPractice misses={withSpace} />);
    const rows = listItems(html);
    const spaceRow = rows.find((row) => row.includes(">Space<"));

    expect(spaceRow).toBeDefined();
    expect(spaceRow).not.toMatch(/class="[^"]*\bsize-7\b/);
    expect(spaceRow).toMatch(/class="[^"]*\bh-7\b[^"]*\bw-auto\b/);
  });

  /**
   * Round-3 tone fix: every badge previously shared `bg-coral-deep` — the
   * heat map's retired PEAK-ALARM tier — so a single miss on one key read as
   * maximally alarming, the same red as a 17-miss key. Uniform styling
   * regardless of rank is correct and must stay (see the addendum above);
   * the fix is the colour chosen for that uniform fill, not the uniformity.
   */
  it("fills the badge with a calm neutral tone, not the retired peak-alarm coral-deep", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).not.toContain("bg-coral-deep");
  });
});
