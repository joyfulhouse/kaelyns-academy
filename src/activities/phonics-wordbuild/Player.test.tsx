import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhonicsWordbuildConfig } from "@/content/activity-configs";
import { PhonicsWordbuildPlayer } from "./Player";

const speechState = vi.hoisted(() => ({ supported: false }));

vi.mock("../_shared/useSpeech", () => ({
  useSpeech: () => ({
    supported: speechState.supported,
    hasVoice: true,
    speak: () => undefined,
    cancel: () => undefined,
  }),
}));

const config: PhonicsWordbuildConfig = {
  focus: "sh digraph",
  instruction: "Listen, then build the word.",
  tiles: ["sh", "i", "p"],
  words: [{ word: "ship", picture: "🚢" }],
};

function renderPlayer(): string {
  return renderToStaticMarkup(
    createElement(PhonicsWordbuildPlayer, { config, onComplete: () => undefined }),
  );
}

describe("phonics word-build audio-first contract", () => {
  beforeEach(() => {
    speechState.supported = false;
  });

  it("offers an explicit target-help path when speech synthesis is unavailable", () => {
    const markup = renderPlayer();

    expect(markup).toContain("Audio isn’t available here. Show the target word to keep going.");
    expect(markup).toContain("Show the target word");
    expect(markup).not.toContain("Word to build: ship");
  });

  it("does not expose the target text through pre-help accessible names", () => {
    const markup = renderPlayer();

    expect(markup).not.toContain('aria-label="ship"');
    expect(markup).not.toContain("Say the word ship");
    expect(markup).toContain('aria-label="Picture clue for the target word"');
  });

  it("uses a generic, non-leaking accessible name for target audio", () => {
    speechState.supported = true;

    const markup = renderPlayer();

    expect(markup).toContain('aria-label="Hear the target word"');
    expect(markup).not.toContain("Say the word ship");
  });
});
