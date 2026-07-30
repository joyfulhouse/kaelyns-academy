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

  it("discloses the reader window and that counts are misses, not a percentage", () => {
    const html = renderToStaticMarkup(<KeysToPractice misses={MISSES} />);
    expect(html).toContain("last 200 activities");
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
});
