import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TypingKeysConfig } from "@/content/activity-configs";
import { KeyPrompt, TypingKeysPlayer } from "./Player";

vi.mock("../_shared/typing/TypingStage", () => ({
  TypingStage: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../_shared/useSpeech", () => ({
  useSpeech: () => ({
    supported: false,
    hasVoice: true,
    speak: () => Promise.resolve("unavailable" as const),
    cancel: () => undefined,
  }),
}));

function renderPlayer(config: TypingKeysConfig): string {
  return renderToStaticMarkup(
    createElement(TypingKeysPlayer, {
      config,
      onComplete: () => undefined,
    }),
  );
}

describe("Key Camp target prompt", () => {
  it("keeps letter prompts live but uses the cheering mascot for completion", () => {
    const activeMarkup = renderToStaticMarkup(<KeyPrompt target="a" />);
    const completeMarkup = renderToStaticMarkup(<KeyPrompt target={null} />);

    expect(activeMarkup).toMatch(/<p[^>]*aria-live="polite"[^>]*>A<\/p>/);
    expect(completeMarkup).toContain('aria-label="Key Camp complete"');
    expect(completeMarkup).not.toContain("aria-live");
    expect(completeMarkup).not.toContain("🎉");
  });

  it("shows one child-visible star for every prompt while keeping text progress", () => {
    const markup = renderPlayer({
      instruction: "Press the letter.",
      keys: ["a"],
      reps: 3,
      showHands: false,
    });

    expect(markup).toContain('aria-label="0 of 3 stars"');
    expect(markup).toContain("1 of 3");
    expect(markup.match(/data-star-shape="true"/g)).toHaveLength(3);
  });

  it("renders a capital as an explicit shift chord", () => {
    const markup = renderPlayer({
      instruction: "Make a big letter.",
      keys: ["A"],
      reps: 1,
      showHands: false,
    });

    expect(markup).toMatch(/<p[^>]*>⇧ \+ A<\/p>/);
  });

  it("keeps the existing uppercase visual for a lowercase target", () => {
    const markup = renderPlayer({
      instruction: "Press the letter.",
      keys: ["a"],
      reps: 1,
      showHands: false,
    });

    expect(markup).toMatch(/<p[^>]*>A<\/p>/);
    expect(markup).not.toContain("⇧");
  });
});
