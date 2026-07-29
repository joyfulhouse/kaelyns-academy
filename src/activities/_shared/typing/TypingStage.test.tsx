import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TypingStage } from "./TypingStage";

const mocks = vi.hoisted(() => ({
  coarsePointerOnly: false,
  spoken: [] as string[],
  speak: vi.fn(),
}));

vi.mock("./useCoarsePointerOnly", () => ({
  useCoarsePointerOnly: () => mocks.coarsePointerOnly,
}));

vi.mock("../useSpeech", () => ({
  useSpeech: () => ({ speak: mocks.speak }),
}));

vi.mock("../useSpeakOnce", () => ({
  useSpeakOnce: (_speak: unknown, text: string) => {
    mocks.spoken.push(text);
  },
}));

describe("TypingStage", () => {
  beforeEach(() => {
    mocks.coarsePointerOnly = false;
    mocks.spoken.length = 0;
  });

  it("asks for the home-row anchor before revealing the game", () => {
    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    // The server snapshot is "not coarse, not proven" — the prove screen.
    expect(markup).toContain("Press the");
    expect(markup).not.toContain("the game");
    expect(mocks.spoken).toEqual([
      "Press the F key to start with your left pointer finger.",
    ]);
  });

  it("speaks one short sentence when typing is blocked", () => {
    mocks.coarsePointerOnly = true;

    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    expect(markup).toContain("Typing needs a keyboard");
    expect(mocks.spoken).toEqual([
      "Typing needs a real keyboard, so come back on a computer.",
    ]);
  });
});
