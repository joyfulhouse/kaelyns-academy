import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TypingKeysConfig } from "@/content/activity-configs";
import { TypingKeysPlayer } from "./Player";

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
