import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "./EmptyState";

// EmptyState replaces the dashed-border "nothing here yet" blocks. The contract
// that matters: the dashed-card base classes are exact and the caller's spacing
// (margin/padding) composes onto them via `className`; the icon node is rendered
// verbatim; the title/description carry their exact classes; and the optional
// description/action are dropped entirely when not supplied.

describe("EmptyState", () => {
  it("composes the caller spacing onto the static dashed-card base", () => {
    const html = renderToStaticMarkup(<EmptyState className="mt-8 p-12" title="No learners yet" />);
    expect(html).toContain(
      'class="grid place-items-center rounded-xl border border-dashed border-line-strong text-center mt-8 p-12"',
    );
  });

  it("renders the dashed-card base alone when no className is given", () => {
    const html = renderToStaticMarkup(<EmptyState title="Only a title" />);
    expect(html).toContain(
      'class="grid place-items-center rounded-xl border border-dashed border-line-strong text-center"',
    );
  });

  it("renders the icon node, title and description with exact classes and copy", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        className="mt-8 p-12"
        icon={<span id="ico" />}
        title="No learners yet"
        description="Add your child below to enroll them."
      />,
    );
    expect(html).toContain('<span id="ico">');
    expect(html).toContain('<p class="mt-3 font-display text-lg font-semibold">No learners yet</p>');
    expect(html).toContain(
      '<p class="mt-1 max-w-sm text-ink-soft">Add your child below to enroll them.</p>',
    );
  });

  it("omits the description and action when neither is provided", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing yet" />);
    expect(html).toContain('<p class="mt-3 font-display text-lg font-semibold">Nothing yet</p>');
    expect(html).not.toContain("max-w-sm");
    expect(html).not.toContain("mt-5");
  });

  it("renders the action below the content in its own slot", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Nothing yet" action={<button type="button">Add</button>} />,
    );
    expect(html).toContain('<div class="mt-5"><button type="button">Add</button></div>');
  });
});
