import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyboardMap } from "./KeyboardMap";

describe("KeyboardMap", () => {
  it("draws every lettered key plus the space bar", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);
    for (const key of ["q", "a", "z", "p", ";", "/"]) {
      expect(markup, key).toContain(`data-key="${key}"`);
    }
    expect(markup).toContain('data-key=" "');
  });

  it("marks the target key so it is not colour alone", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="f" />);
    expect(markup).toContain('data-target="true"');
    expect(markup).toContain('aria-label="Press F, left index finger"');
  });

  it("names the space bar in words rather than as a blank", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target=" " />);
    expect(markup).toContain('aria-label="Press the space bar, right thumb"');
  });

  it("treats a capital as its own key on the board", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="F" />);
    expect(markup).toContain('data-target="true"');
  });
});
