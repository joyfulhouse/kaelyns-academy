import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyboardMap, FINGER_TINT, NO_FINGER_TINT } from "./KeyboardMap";

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
    expect(markup).toContain('aria-label="Keyboard. Press F, left pointer finger."');
    expect(markup).not.toContain("index finger");
  });

  it("names the space bar in words rather than as a blank", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target=" " />);
    expect(markup).toContain('aria-label="Keyboard. Press the space bar, right thumb."');
  });

  it("treats a capital as its own key on the board", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="F" />);
    expect(markup).toContain('data-target="true"');
  });

  it("references only defined Tailwind colour tokens (regression guard)", () => {
    // Extract all defined --color-* tokens from globals.css
    const globalsPath = new URL("../../../app/globals.css", import.meta.url);
    const globalsContent = readFileSync(globalsPath, "utf-8");
    const definedTokens = new Set<string>();
    const tokenRegex = /--color-([a-z-]+):/g;
    let match;
    while ((match = tokenRegex.exec(globalsContent))) {
      definedTokens.add(match[1]);
    }

    // Extract all colour tokens referenced in KeyboardMap by reading the actual exports
    const referencedTokens = new Set<string>();

    // From FINGER_TINT values: extract "token" from "bg-token/opacity"
    Object.values(FINGER_TINT).forEach((cls) => {
      const tokenName = cls.split("/")[0].replace("bg-", "");
      referencedTokens.add(tokenName);
    });

    // From NO_FINGER_TINT: extract "token" from "bg-token" (or "bg-token/opacity")
    const noFingerTokenName = NO_FINGER_TINT.split("/")[0].replace("bg-", "");
    referencedTokens.add(noFingerTokenName);

    // Assert all referenced tokens are defined
    referencedTokens.forEach((token) => {
      expect(definedTokens, `colour token "${token}" must be defined`).toContain(token);
    });
  });
});
