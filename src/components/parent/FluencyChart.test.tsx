import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FluencyChart } from "./FluencyChart";

const POINTS = [
  { day: "2026-07-09", wcpm: 10, label: "Jul 9" },
  { day: "2026-07-10", wcpm: 20, label: "Jul 10" },
  { day: "2026-07-11", wcpm: 35, label: "Yesterday" },
];

describe("FluencyChart", () => {
  it("renders deterministic index-spaced polyline coordinates", () => {
    const html = renderToStaticMarkup(
      <FluencyChart points={POINTS} latest={35} best={35} />,
    );

    expect(html).toContain('viewBox="0 0 640 280"');
    expect(html).toContain('points="48,192 328,164 608,122"');
    expect(renderToStaticMarkup(<FluencyChart points={POINTS} latest={35} best={35} />)).toBe(
      html,
    );
  });

  it("renders a calm empty state without an empty SVG", () => {
    const html = renderToStaticMarkup(
      <FluencyChart points={[]} latest={null} best={null} />,
    );

    expect(html).toContain("No reading-aloud yet");
    expect(html).not.toContain("<svg");
  });

  it("summarizes latest, best, and trend accessibly without child PII", () => {
    const html = renderToStaticMarkup(
      <FluencyChart points={POINTS} latest={35} best={35} />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain(
      'aria-label="Reading fluency chart. Latest 35 WCPM. Best 35 WCPM. Up 25 WCPM across 3 reading-aloud days."',
    );
    expect(html).not.toContain("Kaelyn");
  });
});
