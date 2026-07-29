import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingWriteConfig } from "@/content/activity-configs";
import type { KeyIntent } from "../_shared/typing/typingKey";
import type { TypingWriteResponse } from "./logic";

/**
 * The suite has no jsdom (this repo runs vitest in the "node" environment, and
 * the sibling typing Player tests never dispatch real DOM events either), so a
 * literal `window` keydown cannot reach `useTypingKeys`. Instead this mocks
 * React's own useState/useRef/useEffect (the same technique
 * `completion-hosts.test.tsx` uses) so `WriteRound` can be invoked directly,
 * repeatedly, like a manual re-render — while `useTypingKeys` is mocked just
 * enough to capture the exact handler the Player wires up. Driving THAT
 * handler with synthetic intents exercises the real reducer wiring end to end
 * (config -> schema -> pressWordKey/pressWordBackspace -> state -> markup ->
 * onComplete) without re-testing useTypingKeys' own keydown-to-intent mapping,
 * which is already covered by useTypingKeys.test.ts.
 */
const fixtures = vi.hoisted(() => ({
  refIndex: 0,
  refValues: [] as { current: unknown }[],
  stateIndex: 0,
  stateValues: [] as unknown[],
  speech: {
    supported: true,
    hasVoice: true,
    speak: vi.fn(() => Promise.resolve("completed" as const)),
    cancel: vi.fn(),
  },
  targetSpeech: {
    unavailable: false,
    speakTarget: vi.fn(() => Promise.resolve("completed" as const)),
    reset: vi.fn(),
  },
  speakOnce: vi.fn(),
  onIntent: null as ((intent: KeyIntent) => void) | null,
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => {
    effect();
  },
  useRef: (initial: unknown) => {
    const index = fixtures.refIndex++;
    if (index >= fixtures.refValues.length) fixtures.refValues[index] = { current: initial };
    return fixtures.refValues[index];
  },
  useState: (initial: unknown) => {
    const index = fixtures.stateIndex++;
    if (index >= fixtures.stateValues.length) {
      fixtures.stateValues[index] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    const setter = (next: unknown) => {
      fixtures.stateValues[index] =
        typeof next === "function"
          ? (next as (prior: unknown) => unknown)(fixtures.stateValues[index])
          : next;
    };
    return [fixtures.stateValues[index], setter];
  },
}));

vi.mock("../_shared/useActivity", () => ({
  useActivity: (schema: { parse: (config: unknown) => unknown }, config: unknown) =>
    schema.parse(config),
}));
vi.mock("../_shared/useSpeech", () => ({
  useSpeech: () => fixtures.speech,
}));
vi.mock("../_shared/useTargetSpeech", () => ({
  useTargetSpeech: () => fixtures.targetSpeech,
}));
vi.mock("../_shared/useSpeakOnce", () => ({
  useSpeakOnce: (...args: unknown[]) => fixtures.speakOnce(...args),
}));
vi.mock("../_shared/typing/useTypingKeys", () => ({
  useTypingKeys: (onIntent: (intent: KeyIntent) => void) => {
    fixtures.onIntent = onIntent;
  },
}));
vi.mock("../_shared/typing/TypingStage", () => ({
  TypingStage: ({ children }: { children: unknown }) => children,
}));

import { TypingStage } from "../_shared/typing/TypingStage";
import { ExpectedTiles } from "../_shared/typing/WordTiles";
import { TypingWritePlayer, WriteRound, writeAnnouncement } from "./Player";

function renderRound(
  config: TypingWriteConfig,
  onComplete: (response: TypingWriteResponse) => void,
): ReactElement {
  fixtures.refIndex = 0;
  fixtures.stateIndex = 0;
  return WriteRound({ config, onComplete }) as ReactElement;
}

function toMarkup(
  config: TypingWriteConfig,
  onComplete: (response: TypingWriteResponse) => void,
): string {
  return renderToStaticMarkup(renderRound(config, onComplete));
}

function type(char: string, shiftKey = false): void {
  fixtures.onIntent?.({ type: "char", char, code: `Key${char.toUpperCase()}`, shiftKey });
}

function backspace(): void {
  fixtures.onIntent?.({ type: "backspace" });
}

const SEE_CONFIG: TypingWriteConfig = {
  instruction: "Type the word.",
  mode: "see",
  scope: "word",
  items: ["cat", "sun", "dog"],
};

const HEAR_CONFIG: TypingWriteConfig = { ...SEE_CONFIG, mode: "hear" };

beforeEach(() => {
  fixtures.refIndex = 0;
  fixtures.refValues = [];
  fixtures.stateIndex = 0;
  fixtures.stateValues = [];
  fixtures.speech.supported = true;
  fixtures.speech.hasVoice = true;
  fixtures.targetSpeech.unavailable = false;
  fixtures.onIntent = null;
  vi.clearAllMocks();
});

describe("writeAnnouncement", () => {
  it("announces the item to type in see mode, a listen cue in hear mode, and nothing once finished", () => {
    expect(writeAnnouncement("cat", false)).toBe("Type cat");
    expect(writeAnnouncement("cat", true)).toBe("Listen, then type the word");
    expect(writeAnnouncement(null, false)).toBe("");
  });
});

describe("TypingWritePlayer shell", () => {
  it("mounts through TypingStage with the given onExit, wrapping only WriteRound (req 1)", () => {
    const onExit = () => undefined;
    const element = TypingWritePlayer({
      config: SEE_CONFIG,
      onComplete: () => undefined,
      onExit,
    }) as ReactElement<{ onExit?: () => void; children: ReactElement }>;

    expect(element.type).toBe(TypingStage);
    expect(element.props.onExit).toBe(onExit);
    expect(element.props.children.type).toBe(WriteRound);
  });
});

describe("Word Write see mode", () => {
  it("shows the expected word as tiles, a buffer row, decorative stars, and 1 of 3 progress (reqs 4, 6, 8)", () => {
    const markup = toMarkup(SEE_CONFIG, () => undefined);

    // Three expected-tile letters for "cat", ink-on-paper (not yet typed).
    expect(
      markup.match(
        /grid size-14 place-items-center rounded-xl border-\[3px\] border-ink font-display text-2xl text-ink shadow-pop bg-paper-raised/g,
      ),
    ).toHaveLength(3);
    // The caret placeholder, present with an empty buffer.
    expect(markup).toContain("border-dashed border-ink/40");
    // Decorative fill-up stars: aria-hidden, one per item.
    expect(markup).toMatch(/<span aria-hidden="true"[^>]*><svg data-star-shape="true"/);
    expect(markup.match(/data-star-shape="true"/g)).toHaveLength(3);
    expect(markup).toContain("1 of 3");
    // The live region carries the expected item, never the (empty) buffer.
    expect(markup).toMatch(/aria-live="polite"[^>]*>Type cat</);
  });

  it("colors a correct keystroke honey and a wrong one coral, never revealing intent in the live region", () => {
    toMarkup(SEE_CONFIG, () => undefined);
    type("c");
    type("x"); // wrong: "cat"'s second letter is "a"
    const markup = toMarkup(SEE_CONFIG, () => undefined);

    expect(markup).toContain(
      "grid size-14 place-items-center rounded-xl border-[3px] border-ink font-display text-2xl text-ink shadow-pop bg-honey",
    );
    expect(markup).toContain(
      "grid size-14 place-items-center rounded-xl border-[3px] border-ink font-display text-2xl text-ink shadow-pop bg-coral/55",
    );
    // Still announcing the target, never "cx" or any typed buffer content.
    expect(markup).toMatch(/aria-live="polite"[^>]*>Type cat</);
  });
});

describe("Word Write hear mode", () => {
  it("hides the word behind an ear affordance and offers to hear the word again (req 5)", () => {
    const markup = toMarkup(HEAR_CONFIG, () => undefined);

    expect(markup).not.toContain("bg-paper-raised");
    expect(markup).toContain("Hear the word again");
    expect(markup).toContain("Listen, then type the word");
    expect(markup).not.toContain("Type cat");
  });

  it("reveals the tiles and shows the audio-unavailable notice when speech is unsupported (req 5, D7)", () => {
    fixtures.speech.supported = false;
    const markup = toMarkup(HEAR_CONFIG, () => undefined);

    expect(markup).toContain("bg-paper-raised");
    expect(markup).toContain("Audio isn’t available here.");
    expect(markup).not.toContain("Hear the word again");
  });

  it("reveals the tiles after two corrected mistakes, even while audio stays available (req 5, D7)", () => {
    const initial = toMarkup(HEAR_CONFIG, () => undefined);
    expect(initial).not.toContain("bg-paper-raised");

    type("x");
    backspace(); // mistake 1, corrected
    type("x");
    backspace(); // mistake 2, corrected -> retries reaches 2

    const revealed = toMarkup(HEAR_CONFIG, () => undefined);
    expect(revealed).toContain("bg-paper-raised");
    expect(revealed).toContain("Hear the word again");
    expect(revealed).not.toContain("Audio isn’t available here.");
  });

  it("speaks a NEW utterance per item, keyed by index (req 5)", () => {
    const onComplete = vi.fn();

    renderRound(HEAR_CONFIG, onComplete);
    const firstWordCall = fixtures.speakOnce.mock.calls[1];
    expect(firstWordCall[1]).toBe("cat");
    expect(firstWordCall[2]).toBe(0);
    (firstWordCall[0] as (text: string) => void)("cat");
    expect(fixtures.targetSpeech.speakTarget).toHaveBeenCalledWith("cat");

    type("c");
    type("a");
    type("t"); // completes "cat" -> advances to "sun"
    renderRound(HEAR_CONFIG, onComplete);

    const secondWordCall = fixtures.speakOnce.mock.calls[3];
    expect(secondWordCall[1]).toBe("sun");
    expect(secondWordCall[2]).toBe(1);
  });
});

describe("Word Write completion (§8)", () => {
  it("reports a corrected run whose missedExpected carries only expected characters, never the wrong keystrokes", () => {
    const onComplete = vi.fn();

    renderRound(SEE_CONFIG, onComplete);
    type("x");
    backspace(); // wrong first letter of "cat", corrected
    type("c");
    type("a");
    type("t"); // completes "cat"
    type("s");
    type("u");
    type("n"); // completes "sun"
    type("d");
    type("o");
    type("g"); // completes "dog" -> finished
    renderRound(SEE_CONFIG, onComplete); // lets the completion effect run

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0]![0] as TypingWriteResponse;

    expect(payload.items).toHaveLength(3);
    expect(payload.items[0]).toMatchObject({ i: 0, ok: false, retries: 1, missedExpected: ["c"] });
    expect(payload.items[0]).not.toHaveProperty("typed");
    expect(payload.items[1]).toMatchObject({ i: 1, ok: true, retries: 0, missedExpected: [] });
    expect(payload.items[2]).toMatchObject({ i: 2, ok: true, retries: 0, missedExpected: [] });
    // The wrongly typed "x" must never survive into the reported response —
    // only expected-derived characters (here "c") may appear in missedExpected.
    for (const result of payload.items) {
      expect(result.missedExpected).not.toContain("x");
    }
  });
});

describe("ExpectedTiles", () => {
  it("renders a space as a visible glyph rather than collapsing it", () => {
    const markup = renderToStaticMarkup(ExpectedTiles({ item: "a b" }));
    expect(markup).toContain("␣");
  });
});
