import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TypingStage } from "./TypingStage";

const mocks = vi.hoisted(() => ({
  coarsePointerOnly: null as boolean | null,
  gateKeyHandler: null as
    | ((intent: { type: "char"; char: string; code: string; shiftKey: boolean }) => void)
    | null,
  spoken: [] as { key: unknown; text: string }[],
  cancel: vi.fn(),
  speak: vi.fn(),
}));

vi.mock("./useCoarsePointerOnly", () => ({
  useCoarsePointerOnly: () => mocks.coarsePointerOnly,
}));

vi.mock("../useSpeech", () => ({
  useSpeech: () => ({ cancel: mocks.cancel, speak: mocks.speak }),
}));

vi.mock("../useSpeakOnce", () => ({
  useSpeakOnce: (_speak: unknown, text: string | null, key: unknown) => {
    if (text !== null) mocks.spoken.push({ key, text });
  },
}));

vi.mock("./useTypingKeys", () => ({
  useTypingKeys: (
    onIntent: (intent: { type: "char"; char: string; code: string; shiftKey: boolean }) => void,
  ) => {
    mocks.gateKeyHandler = onIntent;
  },
}));

describe("TypingStage", () => {
  beforeEach(() => {
    mocks.coarsePointerOnly = null;
    mocks.gateKeyHandler = null;
    mocks.spoken.length = 0;
    vi.clearAllMocks();
  });

  it("shows the proof screen without narrating during media-query resolution", () => {
    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    expect(markup).toContain("Press the");
    expect(markup).not.toContain("the game");
    expect(mocks.spoken).toEqual([]);
  });

  it("narrates the resolved proof screen with its own key", () => {
    mocks.coarsePointerOnly = false;

    renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    expect(mocks.spoken).toEqual([
      {
        key: "prove",
        text: "Press the F key to start with your left pointer finger.",
      },
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
      {
        key: "blocked",
        text: "Typing needs a real keyboard, so come back on a computer.",
      },
    ]);
  });

  it("cancels gate narration before accepting the proof key", () => {
    mocks.coarsePointerOnly = false;
    renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    mocks.gateKeyHandler?.({
      type: "char",
      char: "f",
      code: "KeyF",
      shiftKey: false,
    });

    expect(mocks.cancel).toHaveBeenCalledOnce();
  });
});
