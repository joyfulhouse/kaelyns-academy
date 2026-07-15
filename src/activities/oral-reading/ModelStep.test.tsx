import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModeledAudioFallback, OralModelStep } from "./ModelStep";

describe("OralModelStep", () => {
  it("distinguishes in-flight playback from completed modeling", () => {
    const playing = renderToStaticMarkup(
      createElement(OralModelStep, {
        presentation: "listen-repeat",
        speechSupported: true,
        modelStatus: "playing",
        label: "Listen to the word",
        onPlay: () => undefined,
      }),
    );
    const completed = renderToStaticMarkup(
      createElement(OralModelStep, {
        presentation: "listen-repeat",
        speechSupported: true,
        modelStatus: "completed",
        label: "Listen to the word",
        onPlay: () => undefined,
      }),
    );

    expect(playing).toContain("Listening to the whole model…");
    expect(playing).not.toContain("Now it is your turn");
    expect(completed).toContain("The model finished. Now it is your turn.");
  });

  it("announces the adult-model fallback with a real heading", () => {
    const fallback = renderToStaticMarkup(
      createElement(ModeledAudioFallback, { onComplete: () => undefined }),
    );

    expect(fallback).toContain("<h2");
    expect(fallback).toContain("The model audio is not available.");
    expect(fallback).toContain('role="status"');
  });
});
