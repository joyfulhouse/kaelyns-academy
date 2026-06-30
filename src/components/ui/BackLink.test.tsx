import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BackLink } from "./BackLink";

// BackLink unifies the six hand-rolled back-links onto one style. The contract:
// each page's own href + visible label are preserved, the unified class is exact,
// a default back-arrow renders when no icon is given, and a supplied icon
// replaces that default.

describe("BackLink", () => {
  it("renders the destination href, label and the unified link style", () => {
    const html = renderToStaticMarkup(<BackLink href="/admin" label="All programs" />);
    expect(html).toContain('href="/admin"');
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"',
    );
    expect(html).toContain("All programs");
  });

  it("renders a default back-arrow icon when none is given", () => {
    const html = renderToStaticMarkup(<BackLink href="/x" label="Back" />);
    expect(html).toContain("<svg");
  });

  it("renders a supplied icon in place of the default arrow", () => {
    const html = renderToStaticMarkup(
      <BackLink href="/parent/curriculum" label="Curriculum" icon={<span id="ico" />} />,
    );
    expect(html).toContain('<span id="ico">');
    expect(html).toContain("Curriculum");
  });
});
