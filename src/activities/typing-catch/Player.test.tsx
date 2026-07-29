import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { TypingCatchPlayer } from "./Player";

vi.mock("../_shared/typing/TypingStage", () => ({
  TypingStage: ({ children }: { children: ReactNode }) => children,
}));

const CONFIG: TypingCatchConfig = {
  instruction: "Pop the stars!",
  pool: ["a", "s"],
  durationSec: 40,
  lives: 3,
  speed: "gentle",
};

describe("Star Catch Player accessibility", () => {
  it("announces the current targets without exposing visual sprites twice", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Type A");
    expect(markup).toMatch(/aria-hidden="true"[^>]*><span data-falling="a"/);
  });

  it("announces when a target is a capital so the shift skill is audible", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: { ...CONFIG, pool: ["A", "s"] },
        onComplete: () => undefined,
      }),
    );

    expect(markup).toContain("Type capital A");
  });
});
