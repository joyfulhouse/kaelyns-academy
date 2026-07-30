import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TypingRateChart } from "./TypingRateChart";

const POINTS = [
  { day: "2026-07-20", wpm: 8, label: "Jul 20" },
  { day: "2026-07-21", wpm: 14, label: "Jul 21" },
  { day: "2026-07-22", wpm: 22, label: "Today" },
];

describe("TypingRateChart", () => {
  it("renders one deterministic, index-spaced point per day plus an axis label", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    expect(html).toContain('viewBox="0 0 640 280"');
    expect(html).toContain('points="48,167.73 328,128.53 608,76.27"');
    expect(html).toContain("words per minute");
    expect(
      renderToStaticMarkup(<TypingRateChart points={POINTS} />),
    ).toBe(html);
  });

  it("renders a calm empty state without a phantom chart", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={[]} />);

    expect(html).toContain("No typing speed yet");
    expect(html).not.toContain("<svg");
  });

  /** `getTypingRateHistory` filters to `typing-race` attempts only (E7) — Key
   *  Camp and Star Catch never contribute a point, so the empty state must
   *  not tell a parent that grinding those kinds will populate this chart. */
  it("names Rocket Race, the only kind that feeds this chart, in the empty state", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={[]} />);

    expect(html).toContain("Rocket Race");
    expect(html).not.toContain("Key Camp");
    expect(html).not.toContain("Star Catch");
  });

  it("summarizes recent-best, best, and trend accessibly without child PII", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    expect(html).toContain('role="img"');
    expect(html).toContain(
      'aria-label="Typing speed chart. Recent best 22 WPM. Best 22 WPM. Up 14 WPM across 3 typing days."',
    );
    expect(html).not.toContain("Kaelyn");
  });

  /** ITEM 7: `getTypingRateHistory` folds each day to its BEST race — the most
   *  recent point is her best-of-day, not her literal last race. Labeling it
   *  "Latest" would overclaim; "Recent best" says exactly what it is. */
  it("labels the most recent point 'Recent best', not 'Latest'", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    expect(html).toContain("Recent best");
    expect(html).not.toContain(">Latest<");
  });

  /** ITEM 5: the y-axis scales to this learner's own data (no vetted "typical"
   *  band exists for early keyboarding, unlike FluencyChart) — without a
   *  printed ceiling, a mid-height line is unreadable (could be 10 WPM or 40). */
  it("prints a 0 and the ceiling value as y-axis tick labels", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    // POINTS tops out at 22 WPM; ceilingFor rounds up to the next 10 (>= the
    // CEILING_FLOOR of 20), so the ceiling here is 30.
    expect(html).toMatch(/>0<\/text>/);
    expect(html).toMatch(/>30<\/text>/);
  });

  /** ITEM 6: the data line and its point markers must clear WCAG 1.4.11's 3:1
   *  non-text contrast bar against the card — `accent-deep` measured 2.46:1
   *  there (see the fix brief); `coral-deep` clears it (~4.6:1, validated via
   *  an OKLCH→sRGB→WCAG computation in the fix report). */
  it("strokes the data line and its point markers with coral-deep, not the sub-3:1 accent-deep", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    expect(html).toContain('stroke="var(--color-coral-deep)"');
    expect(html).not.toContain('stroke="var(--color-accent-deep)"');
  });

  /** ITEM 8: once populated, the card must still say what it's measuring —
   *  Rocket Race only, best-of-day — not just show bare "WPM" numbers. */
  it("names Rocket Race and the best-of-day window once populated", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    expect(html).toContain("Rocket Race");
    expect(html).toContain("each day");
  });
});
