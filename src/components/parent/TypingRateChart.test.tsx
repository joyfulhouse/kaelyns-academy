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

  it("summarizes latest, best, and trend accessibly without child PII", () => {
    const html = renderToStaticMarkup(<TypingRateChart points={POINTS} />);

    expect(html).toContain('role="img"');
    expect(html).toContain(
      'aria-label="Typing speed chart. Latest 22 WPM. Best 22 WPM. Up 14 WPM across 3 typing days."',
    );
    expect(html).not.toContain("Kaelyn");
  });
});
