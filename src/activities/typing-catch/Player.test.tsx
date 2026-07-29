import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { PauseOverlay, spawnAnnouncement, TypingCatchPlayer } from "./Player";

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
  it("mounts one empty live region and keeps the caught count non-live", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(markup).toContain(
      '<p class="sr-only" aria-live="polite" aria-atomic="true"></p>',
    );
    expect(markup).not.toContain("Type A");
    expect(markup).toMatch(/aria-hidden="true"[^>]*><span data-falling="a"/);
  });

  it("announces only the newest spawned target", () => {
    expect(spawnAnnouncement(["a", "s"], 1)).toBe("Type A");
    expect(spawnAnnouncement(["a", "s"], 2)).toBe("Type S");
  });

  it("speaks capitals and non-letter targets explicitly", () => {
    expect(spawnAnnouncement(["A"], 1)).toBe("Type capital A");
    expect(spawnAnnouncement([" "], 1)).toBe("Type space");
  });

  it("shows a calm click-to-resume overlay only while paused", () => {
    const pausedMarkup = renderToStaticMarkup(
      createElement(PauseOverlay, { paused: true, onResume: () => undefined }),
    );
    const playingMarkup = renderToStaticMarkup(
      createElement(PauseOverlay, { paused: false, onResume: () => undefined }),
    );

    expect(pausedMarkup).toContain("Paused");
    expect(pausedMarkup).toContain("click to keep playing");
    expect(pausedMarkup).toMatch(/<button[^>]*type="button"/);
    expect(playingMarkup).toBe("");
  });
});
