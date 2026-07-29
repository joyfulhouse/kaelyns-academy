import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TypingCatchConfig, TypingKeysConfig } from "@/content/activity-configs";
import { TypingCatchPlayer } from "./typing-catch/Player";
import { TypingKeysPlayer } from "./typing-keys/Player";

describe("typing Player gate boundary", () => {
  it("does not initialize Key Camp state or parse its round before proof", () => {
    const onComplete = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(TypingKeysPlayer, {
        config: {} as TypingKeysConfig,
        onComplete,
      }),
    );

    expect(markup).toContain('data-typing-gate-state="resolving"');
    expect(markup).not.toContain("Press the");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not initialize Star Catch state or parse its round before proof", () => {
    const onComplete = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: {} as TypingCatchConfig,
        onComplete,
      }),
    );

    expect(markup).toContain('data-typing-gate-state="resolving"');
    expect(markup).not.toContain("Press the");
    expect(onComplete).not.toHaveBeenCalled();
  });
});
