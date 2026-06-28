import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "./PageHeader";

// PageHeader replaces ~7 hand-rolled parent/admin headers, so the contract that
// matters is that its rendered markup is byte-for-byte what those inline headers
// produced: the eyebrow/h1/description classes are exact, an absent description
// renders nothing, no `className` means a bare <header> (not class=""), and
// passing `action` switches to the split (flex justify-between) layout while a
// stable slot is kept even when the action content itself is conditionally off.

describe("PageHeader", () => {
  it("renders the stacked eyebrow + h1 + description with exact classes and copy", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        eyebrow="Parent home"
        title="Learners"
        description="Each learner keeps only a display name and birth month."
      />,
    );
    expect(html).toContain(
      '<p class="font-display text-sm font-semibold text-ink-faint">Parent home</p>',
    );
    expect(html).toContain(
      '<h1 class="mt-1 font-display text-3xl font-semibold tracking-tight">Learners</h1>',
    );
    expect(html).toContain(
      '<p class="mt-2 max-w-prose text-ink-soft">Each learner keeps only a display name and birth month.</p>',
    );
  });

  it("omits the description paragraph entirely when none is given", () => {
    const html = renderToStaticMarkup(<PageHeader eyebrow="Parent home" title="Welcome" />);
    expect(html).toContain(
      '<h1 class="mt-1 font-display text-3xl font-semibold tracking-tight">Welcome</h1>',
    );
    expect(html).not.toContain("max-w-prose");
  });

  it("renders a bare <header> with no class attribute when className is omitted", () => {
    const html = renderToStaticMarkup(<PageHeader eyebrow="Parent home" title="Curriculum" />);
    expect(html.startsWith("<header>")).toBe(true);
  });

  it("passes a className straight through to the stacked <header>", () => {
    const html = renderToStaticMarkup(
      <PageHeader className="mt-4" eyebrow="Provenance" title="What the AI made" />,
    );
    expect(html.startsWith('<header class="mt-4">')).toBe(true);
  });

  it("switches to the split layout and renders the action when one is provided", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        eyebrow="Parent home"
        title="How they are doing"
        action={<button type="button">All learners</button>}
      />,
    );
    expect(html.startsWith('<header class="flex flex-wrap items-end justify-between gap-3">')).toBe(
      true,
    );
    // Title block is wrapped in a div in the split layout.
    expect(html).toContain(
      '<div><p class="font-display text-sm font-semibold text-ink-faint">Parent home</p>',
    );
    expect(html).toContain('<button type="button">All learners</button>');
  });

  it("keeps the split layout even when the action content is conditionally hidden", () => {
    // The parent home header always uses the split layout; the right-hand link is
    // only shown for multi-learner accounts. Passing a falsy (but defined) action
    // must still select the split layout so the markup is stable.
    const html = renderToStaticMarkup(
      <PageHeader eyebrow="Parent home" title="How they are doing" action={false} />,
    );
    expect(html.startsWith('<header class="flex flex-wrap items-end justify-between gap-3">')).toBe(
      true,
    );
  });
});
