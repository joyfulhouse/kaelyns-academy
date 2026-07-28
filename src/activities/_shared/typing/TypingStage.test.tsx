import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TypingStage } from "./TypingStage";

describe("TypingStage", () => {
  it("asks for the home-row anchor before revealing the game", () => {
    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    // The server snapshot is "not coarse, not proven" — the prove screen.
    expect(markup).toContain("Press the");
    expect(markup).not.toContain("the game");
  });
});
