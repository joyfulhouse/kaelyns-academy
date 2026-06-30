import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BackLink } from "./BackLink";

// BackLink unifies the six hand-rolled back-links' structure into one primitive
// while preserving each call site's original hover treatment. The contract:
// href + visible label preserved, each variant's class string is exact
// (render-equivalent to the inline original it replaced), a default back-arrow
// renders when no icon is given, and a supplied icon replaces that default.

describe("BackLink", () => {
  it("renders href, label and the default underline variant (parent surface)", () => {
    const html = renderToStaticMarkup(<BackLink href="/parent/learners" label="All learners" />);
    expect(html).toContain('href="/parent/learners"');
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"',
    );
    expect(html).toContain("All learners");
  });

  it("renders the transition variant (admin) exactly as the inline admin links did", () => {
    const html = renderToStaticMarkup(
      <BackLink href="/admin" label="All programs" variant="transition" />,
    );
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"',
    );
    expect(html).toContain("All programs");
  });

  it("renders the plain variant (curriculum) hover style exactly", () => {
    const html = renderToStaticMarkup(
      <BackLink href="/parent/curriculum" label="Curriculum" variant="plain" />,
    );
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"',
    );
  });

  it("renders a default back-arrow icon when none is given", () => {
    const html = renderToStaticMarkup(<BackLink href="/x" label="Back" />);
    expect(html).toContain("<svg");
  });

  it("renders a supplied icon in place of the default arrow", () => {
    const html = renderToStaticMarkup(
      <BackLink
        href="/parent/curriculum"
        label="Curriculum"
        variant="plain"
        icon={<span id="ico" />}
      />,
    );
    expect(html).toContain('<span id="ico">');
    expect(html).toContain("Curriculum");
  });
});
