import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyMissHeatmap } from "./KeyMissHeatmap";

const MISSES = [
  { key: "a", misses: 8, attempts: 40 },
  { key: "q", misses: 0, attempts: 12 },
];

function tagFor(html: string, key: string): string {
  const match = html.match(new RegExp(`<span[^>]*data-key="${key}"[^>]*>`));
  if (!match) throw new Error(`no cell rendered for key "${key}"`);
  return match[0];
}

describe("KeyMissHeatmap", () => {
  it("renders one cell per TYPING_ROWS key plus the space bar", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={MISSES} />);
    const cellCount = (html.match(/data-key="/g) ?? []).length;
    expect(cellCount).toBe(31);
    expect(tagFor(html, " ")).toBeTruthy();
  });

  it("gives a heavily-missed key a visibly different, heavier static tone than an unmissed key", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={MISSES} />);
    const hot = tagFor(html, "a");
    const cold = tagFor(html, "q");

    expect(hot).toContain("bg-coral-deep");
    expect(hot).toContain("font-black");
    expect(cold).toContain("bg-paper-sunk");
    expect(cold).not.toContain("bg-coral-deep");
    expect(cold).not.toContain("font-black");
  });

  it("renders an honest empty state with no fabricated heat when there is no data", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={[]} />);

    expect(html).toContain("No Key Camp practice yet");
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("bg-honey");
    expect(html).not.toContain("bg-coral");
  });

  it("wraps the grid in one role=img landmark with a summarizing label and hides individual cells", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={MISSES} />);

    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Keyboard heat map: 31 keys, most missed are A\."/);

    const hiddenCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(hiddenCount).toBe(31);
  });

  it("never renders a child's display name", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={MISSES} />);
    expect(html).not.toContain("Kaelyn");
  });
});
