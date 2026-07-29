import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import {
  HeartMeter,
  PauseOverlay,
  spawnAnnouncement,
  TypingCatchPlayer,
} from "./Player";

const mocks = vi.hoisted(() => ({
  paused: false,
  documentHidden: false,
  reducedMotion: false,
  speakOnce: vi.fn(),
}));

vi.mock("../_shared/typing/TypingStage", () => ({
  TypingStage: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../_shared/typing/roundPause", () => ({
  useRoundPaused: () => mocks.paused,
  useDocumentHidden: () => mocks.documentHidden,
}));

vi.mock("../_shared/useReducedMotion", () => ({
  useReducedMotion: () => mocks.reducedMotion,
}));

vi.mock("../_shared/useSpeakOnce", () => ({
  useSpeakOnce: (...args: unknown[]) => mocks.speakOnce(...args),
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
    mocks.documentHidden = false;
    mocks.reducedMotion = false;
    vi.clearAllMocks();
  });

  it("mounts separate spawn and heart live regions and keeps the caught count non-live", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup.match(/aria-live="polite"/g)).toHaveLength(2);
    expect(markup).toContain(
      '<p class="sr-only" aria-live="polite" aria-atomic="true"></p>',
    );
    expect(markup).toContain(
      '<span class="sr-only" aria-live="polite" aria-atomic="true">3 hearts left</span>',
    );
    expect(markup).not.toContain("Type A");
    expect(markup).toMatch(/aria-hidden="true"[^>]*><span data-falling="a"/);
  });

  it("shows spent hearts as visible outlines, animates the loss, and announces the count", () => {
    const markup = renderToStaticMarkup(
      createElement(HeartMeter, { lives: 1, maxLives: 3 }),
    );

    expect(markup).toContain('aria-label="1 of 3 hearts left"');
    expect(markup.match(/animate-heart-loss text-ink-soft/g)).toHaveLength(2);
    expect(markup).not.toContain("text-ink-soft/30");
    expect(markup).toContain(
      '<span class="sr-only" aria-live="polite" aria-atomic="true">1 heart left</span>',
    );
  });

  it("announces only the newest spawned target", () => {
    expect(spawnAnnouncement(["a", "s"], 1)).toBe("Type A");
    expect(spawnAnnouncement(["a", "s"], 2)).toBe("Type S");
  });

  it("speaks capitals and non-letter targets explicitly", () => {
    expect(spawnAnnouncement(["A"], 1)).toBe("Hold shift, then type A");
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

    expect(capitalMarkup).toMatch(/data-falling="A"[^>]*>.*⇧A.*<\/span>/s);
    expect(lowercaseMarkup).toMatch(/data-falling="a"[^>]*>.*>A<\/span>/s);
    expect(lowercaseMarkup).not.toContain("⇧");
  });

  it("renders falling targets as honey stars with a three-pixel ink outline", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toMatch(/data-falling="a"[^>]*>.*data-star-shape="true"/s);
    expect(markup).toMatch(/data-star-shape="true"[^>]*class="[^"]*text-ink/);
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="1.125"');
    expect(markup).not.toMatch(/data-falling="a"[^>]*rounded-full/);
  });

  it("falls with a linear transform animation and freezes that animation while paused", () => {
    const playingMarkup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );
    mocks.paused = true;
    const pausedMarkup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(playingMarkup).toContain("animation-name:typing-star-fall");
    expect(playingMarkup).toContain("animation-timing-function:linear");
    expect(playingMarkup).toContain("animation-play-state:running");
    expect(playingMarkup).not.toContain("style=\"top:");
    expect(pausedMarkup).toContain("animation-play-state:paused");
  });

  it("keeps reduced motion static with the discrete per-star countdown", () => {
    mocks.reducedMotion = true;

    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toMatch(/data-playfield="true"[^>]*flex flex-wrap/);
    expect(markup).not.toContain("animation-name:typing-star-fall");
    expect(markup).toMatch(/data-falling="a".*<span class="text-sm text-ink-soft">8<\/span>/s);
  });

  it("renders a sunk-paper playfield with a visible landing line", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toMatch(
      /data-playfield="true"[^>]*class="[^"]*rounded-2xl[^"]*bg-paper-sunk/,
    );
    expect(markup).toMatch(
      /data-ground-line="true"[^>]*class="[^"]*border-t-2[^"]*border-ink-soft/,
    );
  });

  it("adds a large child-visible star count while preserving the caught text", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toMatch(
      /data-catch-progress="true"[^>]*>.*data-star-shape="true".*>0<\/span>/s,
    );
    expect(markup).toContain("Caught 0");
  });

  it("renders the remaining time as a draining ring with the numeral intact", () => {
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="40 seconds left"');
    expect(markup).toContain(">40s</span>");
    expect(markup).toContain('stroke-dashoffset="0"');
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
    expect(pausedMarkup).toContain("rounded-2xl");
    expect(pausedMarkup).not.toContain("rounded-3xl");
    expect(pausedMarkup).toMatch(/<svg[^>]*width="72"[^>]*aria-hidden="true"/);
    expect(mocks.speakOnce).toHaveBeenCalledWith(
      expect.any(Function),
      "Paused — click to keep playing",
    );
    expect(playingMarkup).toBe("");
  });

  it("derives the fall distance from the playfield geometry in one CSS block", () => {
    const globalsPath = new URL("../../app/globals.css", import.meta.url);
    const globalsContent = readFileSync(globalsPath, "utf-8");

    // The keyframe must read the derived var — a literal distance here can
    // silently detach from the well height and land stars off the ground line.
    expect(globalsContent).toContain(
      "translate3d(-50%, var(--typing-fall-distance), 0)",
    );
    const playfieldBlock = globalsContent.match(/\.typing-playfield \{[^}]*\}/)?.[0];
    expect(playfieldBlock).toBeDefined();
    expect(playfieldBlock).toContain("--typing-playfield-height: 18rem");
    expect(playfieldBlock).toContain("--typing-sprite-size: 4rem");
    expect(playfieldBlock).toMatch(
      /--typing-fall-distance: calc\(\s*var\(--typing-playfield-height\) - var\(--typing-sprite-size\)\s*\)/,
    );
    expect(playfieldBlock).toContain("height: var(--typing-playfield-height)");

    // The sprite is Tailwind size-16 = 4rem; keep it matched to the CSS var.
    const markup = renderToStaticMarkup(
      createElement(TypingCatchPlayer, {
        config: CONFIG,
        onComplete: () => undefined,
      }),
    );
    expect(markup).toMatch(/data-playfield="true"[^>]*typing-playfield/);
    expect(markup).toMatch(/data-falling="a"[^>]*class="[^"]*size-16/);
  });

  it("stays silent when the pause comes from a hidden tab", () => {
    mocks.documentHidden = true;

    renderToStaticMarkup(
      createElement(PauseOverlay, { paused: true, onResume: () => undefined }),
    );

    expect(mocks.speakOnce).toHaveBeenCalledWith(expect.any(Function), null);
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
