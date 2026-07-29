import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { PauseOverlay, spawnAnnouncement, TypingCatchPlayer } from "./Player";

const mocks = vi.hoisted(() => ({
  paused: false,
}));

vi.mock("../_shared/typing/TypingStage", () => ({
  TypingStage: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./useRoundPaused", () => ({
  useRoundPaused: () => mocks.paused,
}));

const CONFIG: TypingCatchConfig = {
  instruction: "Pop the stars!",
  pool: ["a", "s"],
  durationSec: 40,
  lives: 3,
  speed: "gentle",
};

describe("Star Catch Player accessibility", () => {
  beforeEach(() => {
    mocks.paused = false;
  });

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

  it("renders a capital star as a shift chord and leaves lowercase unchanged", () => {
    const capitalMarkup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: { ...CONFIG, pool: ["A", "S"] },
        onComplete: () => undefined,
      }),
    );
    const lowercaseMarkup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: { ...CONFIG, pool: ["a", "s"] },
        onComplete: () => undefined,
      }),
    );

    expect(capitalMarkup).toMatch(/data-falling="A"[^>]*>⇧A<\/span>/);
    expect(lowercaseMarkup).toMatch(/data-falling="a"[^>]*>A<\/span>/);
    expect(lowercaseMarkup).not.toContain("⇧");
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

  it("renders the pause overlay from the visibility and focus store", () => {
    mocks.paused = true;

    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toContain("Paused — click to keep playing");
  });
});
