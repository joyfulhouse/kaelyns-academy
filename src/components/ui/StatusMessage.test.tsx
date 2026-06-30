import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusMessage } from "./StatusMessage";

// StatusMessage replaces ~19 hand-rolled status badges, so the contract that
// matters is byte-level: the inline-flex base + the tone's text color are exact,
// the tone selects the ARIA role (success -> status, error -> alert) the call
// sites relied on, an icon is rendered, the children copy is verbatim, and a
// caller's spacing className composes onto the static base (never a constructed
// class string).

describe("StatusMessage", () => {
  it("renders the success tone with role=status, text-success and the message copy", () => {
    const html = renderToStaticMarkup(
      <StatusMessage tone="success">Settings saved.</StatusMessage>,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-success"',
    );
    expect(html).toContain("Settings saved.");
    // An icon is rendered inline (Phosphor renders an <svg>).
    expect(html).toContain("<svg");
    expect(html).toContain("size-4");
  });

  it("renders the error tone with role=alert and text-danger", () => {
    const html = renderToStaticMarkup(
      <StatusMessage tone="error">Could not save.</StatusMessage>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-danger"',
    );
    expect(html).toContain("Could not save.");
    expect(html).toContain("<svg");
  });

  it("composes a caller's spacing className onto the static base", () => {
    const html = renderToStaticMarkup(
      <StatusMessage tone="error" className="mt-2">
        Keyed error.
      </StatusMessage>,
    );
    expect(html).toContain(
      'class="inline-flex items-center gap-1.5 text-sm font-medium text-danger mt-2"',
    );
  });

  it("uses a span wrapper so it stays inline-level wherever the badge sat", () => {
    const html = renderToStaticMarkup(<StatusMessage tone="success">Done</StatusMessage>);
    expect(html.startsWith("<span")).toBe(true);
  });
});
