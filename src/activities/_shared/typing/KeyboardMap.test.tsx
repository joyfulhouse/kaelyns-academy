import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyboardMap, FINGER_TINT, NO_FINGER_TINT } from "./KeyboardMap";

describe("KeyboardMap", () => {
  it("draws every lettered key, both shift keys, and the space bar", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);
    for (const key of ["q", "a", "z", "p", ";", "/"]) {
      expect(markup, key).toContain(`data-key="${key}"`);
    }
    expect(markup).toContain('data-key="ShiftLeft"');
    expect(markup).toContain('data-key="ShiftRight"');
    expect(markup).toContain('data-key=" "');
  });

  it("uses key-shaped corners and staggers the home and bottom rows", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);

    expect(markup).toMatch(/data-key="q"[^>]*class="[^"]*rounded-sm/);
    expect(markup).toMatch(/data-key="ShiftLeft"[^>]*class="[^"]*rounded-sm/);
    expect(markup).toMatch(/data-row="top"[^>]*class="[^"]*pl-0/);
    expect(markup).toMatch(/data-row="home"[^>]*class="[^"]*pl-3/);
    expect(markup).toMatch(/data-row="bottom"[^>]*class="[^"]*pl-6/);
  });

  it("uses one strong tint band and explains every finger colour in kid words", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);

    expect(new Set(Object.values(FINGER_TINT))).toHaveLength(5);
    for (const tint of Object.values(FINGER_TINT)) {
      expect(tint).toMatch(/^bg-key-[a-z]+\/55$/);
    }
    expect(markup).toContain('aria-label="Finger color guide"');
    for (const label of ["pinky", "ring", "tall", "pointer", "thumb"]) {
      expect(markup).toMatch(new RegExp(`data-finger="${label}"[^>]*>.*${label}`, "s"));
    }
  });

  it("uses clamp-sized keyboard geometry so both shift keys fit at narrow widths", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);
    const globalsPath = new URL("../../../app/globals.css", import.meta.url);
    const globalsContent = readFileSync(globalsPath, "utf-8");

    expect(markup).toMatch(/data-key="q"[^>]*class="[^"]*typing-key(?:\s|")/);
    expect(markup).toMatch(/data-key="ShiftLeft"[^>]*class="[^"]*typing-key-shift/);
    expect(markup).toMatch(/data-key="ShiftRight"[^>]*class="[^"]*typing-key-shift/);
    expect(markup).toMatch(/data-key=" "[^>]*class="[^"]*typing-key-space/);
    expect(globalsContent).toMatch(/--typing-key-size:\s*clamp\(/);
    expect(globalsContent).toMatch(/--typing-shift-width:\s*clamp\(/);
    expect(globalsContent).toMatch(/--typing-key-gap:\s*clamp\(/);
  });

  it("gives every keycap the Wonder Studio ink outline and tactile shadow", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);

    for (const key of ["q", "ShiftLeft", "ShiftRight", " "]) {
      const escapedKey = key === " " ? " " : key;
      expect(markup).toMatch(
        new RegExp(
          `data-key="${escapedKey}"[^>]*class="[^"]*border-2[^"]*border-ink[^"]*shadow-pop`,
        ),
      );
    }
  });

  it("marks the target key so it is not colour alone", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="f" />);
    const globalsPath = new URL("../../../app/globals.css", import.meta.url);
    const globalsContent = readFileSync(globalsPath, "utf-8");

    expect(markup).toContain('data-target="true"');
    expect(markup).toMatch(/data-target="true"[^>]*class="[^"]*typing-key-target/);
    expect(markup).toContain('aria-label="Keyboard. Press F, left pointer finger."');
    expect(markup).not.toContain("index finger");
    expect(globalsContent).toMatch(
      /\.typing-key-target::after\s*\{[^}]*box-shadow:/s,
    );
    expect(globalsContent).toContain("animation: typing-key-halo 2s");
  });

  it("names the space bar in words rather than as a blank", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target=" " />);
    expect(markup).toContain('aria-label="Keyboard. Press the space bar, right thumb."');
  });

  it("labels a capital as a chord and marks the opposite-hand shift", () => {
    const leftLetter = renderToStaticMarkup(<KeyboardMap target="A" />);
    const rightLetter = renderToStaticMarkup(<KeyboardMap target="J" />);

    expect(leftLetter).toContain(
      'aria-label="Keyboard. Hold shift, then press A, left pinky finger."',
    );
    expect(leftLetter).toMatch(/data-key="ShiftRight"[^>]*data-target="true"/);
    expect(leftLetter).not.toMatch(/data-key="ShiftLeft"[^>]*data-target="true"/);
    expect(rightLetter).toMatch(/data-key="ShiftLeft"[^>]*data-target="true"/);
    expect(rightLetter).not.toMatch(/data-key="ShiftRight"[^>]*data-target="true"/);
  });

  it("does not mark either shift for a lowercase target", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="a" />);

    expect(markup).toContain(
      'aria-label="Keyboard. Press A, left pinky finger."',
    );
    expect(markup).not.toMatch(/data-key="Shift(?:Left|Right)"[^>]*data-target="true"/);
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
