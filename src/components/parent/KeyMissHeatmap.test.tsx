import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyMissHeatmap } from "./KeyMissHeatmap";

const MISSES = [
  { key: "a", misses: 12, attempts: 40 },
  { key: "s", misses: 2, attempts: 10 },
  { key: "q", misses: 0, attempts: 12 },
];

/** The dataset's own worst key has only 2 misses. Under the old
 * misses/peakMisses ratio, 2/2 = 1.0 would classify this as "peak" — the
 * only fixture shape that can catch a regression to relative scaling. */
const LOW_PEAK_MISSES = [{ key: "s", misses: 2, attempts: 10 }];

/** Pins the collapsed four-tier boundary: 6 is the new floor of "peak"
 * (the old five-tier scale put 6-10 in a separate "high" tier). */
const SIX_AND_TWELVE_MISSES = [
  { key: "d", misses: 6, attempts: 20 },
  { key: "a", misses: 12, attempts: 40 },
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

  it("never renders the retired honey-deep tone, collapsed into the four-tier scale", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={[...MISSES, ...SIX_AND_TWELVE_MISSES]} />);
    expect(html).not.toContain("bg-honey-deep");
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

  it("pins fixed absolute thresholds so heat means the same thing every time, not a dataset-relative scale", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={MISSES} />);
    const fewMisses = tagFor(html, "s"); // 2 misses: an ordinary slip
    const manyMisses = tagFor(html, "a"); // 12 misses: worth a parent's attention

    expect(fewMisses).not.toContain("bg-coral-deep");
    expect(fewMisses).not.toContain("font-black");
    expect(fewMisses).toContain("bg-honey");
    expect(manyMisses).toContain("bg-coral-deep");
    expect(manyMisses).toContain("font-black");
  });

  it("keeps a 2-miss key at the low tone even when it is the dataset's worst key (guards against reverting to relative scaling)", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={LOW_PEAK_MISSES} />);
    const cell = tagFor(html, "s");

    expect(cell).toContain("bg-honey");
    expect(cell).not.toContain("bg-coral-deep");
    expect(cell).not.toContain("font-black");
  });

  it("puts both a 6-miss key and a 12-miss key at the peak tone, the collapsed four-tier boundary", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={SIX_AND_TWELVE_MISSES} />);
    const six = tagFor(html, "d");
    const twelve = tagFor(html, "a");

    expect(six).toContain("bg-coral-deep");
    expect(six).toContain("font-black");
    expect(twelve).toContain("bg-coral-deep");
    expect(twelve).toContain("font-black");
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
    expect(html).toMatch(/aria-label="Keyboard heat map: 31 keys, most missed are A, S\."/);

    const hiddenCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(hiddenCount).toBe(31);
  });

  it("never renders a child's display name", () => {
    const html = renderToStaticMarkup(<KeyMissHeatmap misses={MISSES} />);
    expect(html).not.toContain("Kaelyn");
  });
});
