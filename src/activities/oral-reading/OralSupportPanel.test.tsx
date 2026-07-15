import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OralSupportPanel } from "./OralSupportPanel";

describe("OralSupportPanel", () => {
  it("keeps the focus target and live announcement outside its actions", () => {
    const markup = renderToStaticMarkup(
      createElement(OralSupportPanel, {
        title: "Read it to a grown-up.",
        description: "The microphone is optional.",
        focusOnMount: true,
        canRetry: true,
        onRetry: () => undefined,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Read it to a grown-up. The microphone is optional.");
    expect(markup.indexOf('role="status"')).toBeLessThan(markup.indexOf("Try again"));
  });
});
