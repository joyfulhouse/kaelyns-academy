import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RetryFeedback } from "./RetryFeedback";

describe("RetryFeedback", () => {
  it("renders persistent coaching in a polite atomic status", () => {
    const markup = renderToStaticMarkup(<RetryFeedback message="Keep your work. Try again." />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain("Keep your work. Try again.");
  });

  it("reserves space without announcing an empty message", () => {
    const markup = renderToStaticMarkup(<RetryFeedback message={null} />);

    expect(markup).toContain("min-h-7");
    expect(markup).not.toContain('role="status"');
  });
});
