import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PauseOverlay } from "./PauseOverlay";

const mocks = vi.hoisted(() => ({
  documentHidden: false,
  speakOnce: vi.fn(),
}));

vi.mock("./roundPause", () => ({
  useDocumentHidden: () => mocks.documentHidden,
}));

vi.mock("../useSpeakOnce", () => ({
  useSpeakOnce: (...args: unknown[]) => mocks.speakOnce(...args),
}));

describe("PauseOverlay", () => {
  beforeEach(() => {
    mocks.documentHidden = false;
    vi.clearAllMocks();
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

  it("stays silent when the pause comes from a hidden tab", () => {
    mocks.documentHidden = true;

    renderToStaticMarkup(
      createElement(PauseOverlay, { paused: true, onResume: () => undefined }),
    );

    expect(mocks.speakOnce).toHaveBeenCalledWith(expect.any(Function), null);
  });
});
