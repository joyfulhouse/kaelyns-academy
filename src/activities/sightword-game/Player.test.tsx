import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SightwordGameConfig } from "@/content/activity-configs";
import { SightwordGamePlayer } from "./Player";

const config: SightwordGameConfig = {
  instruction: "Listen, then find the word.",
  skillTag: "reading.sight-words",
  rounds: [
    {
      target: "the",
      choices: ["then", "the", "they"],
      spokenPrompt: "Find the word the.",
    },
  ],
};

describe("sight-word Player audio-first contract", () => {
  it("does not separately expose the target before the learner asks for help", () => {
    const markup = renderToStaticMarkup(
      createElement(SightwordGamePlayer, { config, onComplete: () => undefined }),
    );

    expect(markup).not.toContain("Target word: the");
    expect(markup).not.toContain("Hear target the");
    expect(markup).toContain("Show the word");
    expect(markup.match(/>the<\/button>/g)).toHaveLength(1);
  });

  it("renders an explicit way forward when speech synthesis is unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(SightwordGamePlayer, { config, onComplete: () => undefined }),
    );

    expect(markup).toContain("Audio isn’t available");
    expect(markup).toContain("Show the word");
  });

  it("locks blind guesses when audio is unavailable until the target is shown", () => {
    const markup = renderToStaticMarkup(
      createElement(SightwordGamePlayer, { config, onComplete: () => undefined }),
    );

    expect(markup.match(/<button[^>]*disabled=""[^>]*>(?:then|the|they)<\/button>/g)).toHaveLength(
      3,
    );
  });
});
