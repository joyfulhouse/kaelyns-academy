import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarBadge } from "./AvatarBadge";

// AvatarBadge replaces the inline avatar-initial spans on the parent home (md)
// and learner-detail header (lg). The rendered markup must stay byte-for-byte
// what those inline spans produced — same decorative span, same class order, and
// the same uppercased first initial.

describe("AvatarBadge", () => {
  it("renders the md badge byte-identically to the parent-home inline span", () => {
    const html = renderToStaticMarkup(<AvatarBadge name="ada" />);
    expect(html).toBe(
      '<span aria-hidden="true" class="grid size-14 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-2xl font-semibold text-ink">A</span>',
    );
  });

  it("renders the lg badge with the larger box + glyph", () => {
    const html = renderToStaticMarkup(<AvatarBadge name="Ben" size="lg" />);
    expect(html).toBe(
      '<span aria-hidden="true" class="grid size-16 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-3xl font-semibold text-ink">B</span>',
    );
  });

  it("uppercases the first character and falls back to ? for a blank name", () => {
    expect(renderToStaticMarkup(<AvatarBadge name="zoe" />)).toContain(">Z</span>");
    expect(renderToStaticMarkup(<AvatarBadge name="   " />)).toContain(">?</span>");
  });

  it("appends a caller className after the size utilities", () => {
    const html = renderToStaticMarkup(<AvatarBadge name="ada" className="shadow-pop" />);
    expect(html).toContain("font-semibold text-ink shadow-pop");
  });
});
