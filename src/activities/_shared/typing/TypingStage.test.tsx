import { readFileSync } from "node:fs";
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

  it("centers every gate state in the full shell activity area", () => {
    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );
    const globalsPath = new URL("../../../app/globals.css", import.meta.url);
    const globalsContent = readFileSync(globalsPath, "utf-8");

    expect(markup).toMatch(
      /class="[^"]*typing-stage[^"]*justify-center/,
    );
    expect(globalsContent).toMatch(
      /\.typing-stage\s*\{[^}]*min-height:\s*calc\(100dvh - 10rem\)/s,
    );
  });

  it("shows only a neutral keyboard icon during media-query resolution", () => {
    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    expect(markup).toContain('data-typing-gate-state="resolving"');
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("Press the");
    expect(markup).not.toContain("Typing needs");
    expect(markup).not.toContain("the game");
    expect(mocks.spoken).toEqual([]);
  });

  it("narrates the resolved proof screen with its own key", () => {
    mocks.coarsePointerOnly = false;

    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    expect(markup).toMatch(
      /<kbd[^>]*class="[^"]*rounded-sm[^"]*border-2[^"]*border-ink[^"]*shadow-pop/,
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
    const onExit = vi.fn();

    const markup = renderToStaticMarkup(
      <TypingStage onExit={onExit}>
        <p>the game</p>
      </TypingStage>,
    );

    expect(markup).toContain("Typing needs a keyboard");
    expect(markup).toMatch(/<button[^>]*>.*Pick something else<\/button>/s);
    expect(markup).toContain("<svg");
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
