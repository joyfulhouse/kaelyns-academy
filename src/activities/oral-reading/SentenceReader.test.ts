import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeechController } from "../_shared/useSpeech";
import {
  KaraokePassage,
  LISTEN_WORD_DWELL_MS,
  SENTENCE_WORD_CLASSES,
  SETTLE_WORD_STAGGER_MS,
  parseSentenceRouteResult,
  sentenceWordVisualState,
  splitPassageWords,
  startLatestListenWordSweep,
  startListenWordSweep,
  startSettleWordReveal,
} from "./SentenceReader";

describe("sentence oral-reading feedback", () => {
  it("keeps display punctuation while counting passage words deterministically", () => {
    expect(splitPassageWords("  We can see the cat. ")).toEqual([
      "We",
      "can",
      "see",
      "the",
      "cat.",
    ]);
  });

  it("accepts only a complete derived response and strips unrelated fields", () => {
    expect(
      parseSentenceRouteResult(
        {
          result: "matched",
          words: [{ state: "correct" }, { state: "correct" }],
          wcpm: 42,
          verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          transcript: "must not cross the boundary",
        },
        2,
      ),
    ).toEqual({
      result: "matched",
      words: [{ state: "correct" }, { state: "correct" }],
      wcpm: 42,
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(
      parseSentenceRouteResult(
        {
          result: "matched",
          words: [{ state: "correct" }],
          verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
        2,
      ),
    ).toBe("unavailable");
    expect(
      parseSentenceRouteResult(
        {
          result: "matched",
          words: [{ state: "incorrect" }, { state: "correct" }],
          verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
        2,
      ),
    ).toBe("unavailable");
    expect(
      parseSentenceRouteResult(
        { result: "matched", words: [{ state: "correct" }, { state: "correct" }] },
        2,
      ),
    ).toBe("unavailable");
  });

  it("uses static success, honey, and neutral classes with no child red state", () => {
    expect(SENTENCE_WORD_CLASSES.active).toContain("bg-honey");
    expect(SENTENCE_WORD_CLASSES.correct).toContain("bg-success");
    expect(SENTENCE_WORD_CLASSES.unclear).toContain("bg-honey");
    expect(SENTENCE_WORD_CLASSES.neutral).toContain("bg-paper-sunk");
    for (const classes of Object.values(SENTENCE_WORD_CLASSES)) {
      expect(classes).not.toMatch(/(?:^|\s)(?:bg|text|border)-(?:danger|red|rose)(?:-|\s|$)/);
    }
  });

  it("disables unclear-word replay while the microphone owns audio", () => {
    const speech: SpeechController = {
      supported: true,
      hasVoice: true,
      speak: vi.fn<SpeechController["speak"]>(() => Promise.resolve("completed")),
      cancel: vi.fn(),
    };
    const markup = renderToStaticMarkup(
      createElement(KaraokePassage, {
        passage: "Try me",
        settled: [{ state: "unclear" }, { state: "correct" }],
        revealedWordCount: 2,
        speech,
        playbackDisabled: true,
      }),
    );

    expect(markup).toContain('aria-label="Hear Try"');
    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Hear Try")(?=[^>]*disabled="")[^>]*>/,
    );
  });
});

describe("sentence modeled-read karaoke timeline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances one active word per dwell and clears after playback", () => {
    const states: (number | null)[] = [];
    startListenWordSweep(3, false, (activeWord) => states.push(activeWord));

    expect(states).toEqual([0]);
    vi.advanceTimersByTime(LISTEN_WORD_DWELL_MS);
    expect(states).toEqual([0, 1]);
    vi.advanceTimersByTime(LISTEN_WORD_DWELL_MS);
    expect(states).toEqual([0, 1, 2]);
    vi.advanceTimersByTime(LISTEN_WORD_DWELL_MS);
    expect(states).toEqual([0, 1, 2, null]);
  });

  it("clears its timer and active word when playback is interrupted or unmounted", () => {
    const interrupted: (number | null)[] = [];
    const interrupt = startListenWordSweep(3, false, (activeWord) =>
      interrupted.push(activeWord),
    );
    interrupt();
    vi.advanceTimersByTime(LISTEN_WORD_DWELL_MS * 4);
    expect(interrupted).toEqual([0, null]);

    const unmounted: (number | null)[] = [];
    const unmountCleanup = startListenWordSweep(3, false, (activeWord) =>
      unmounted.push(activeWord),
    );
    unmountCleanup();
    vi.runAllTimers();
    expect(unmounted).toEqual([0, null]);
  });

  it("lets a rapid replay keep ownership of its own active-word sweep", () => {
    const states: (number | null)[] = [];
    const slot = { current: null as (() => void) | null };
    const first = startLatestListenWordSweep(slot, 3, false, (activeWord) =>
      states.push(activeWord),
    );

    startLatestListenWordSweep(slot, 3, false, (activeWord) => states.push(activeWord));
    expect(states).toEqual([0, null, 0]);

    // The first speech promise settles as cancelled after replay has begun. Its
    // cleanup must not clear or cancel the second request's sweep.
    first();
    expect(states).toEqual([0, null, 0]);
    vi.advanceTimersByTime(LISTEN_WORD_DWELL_MS);
    expect(states).toEqual([0, null, 0, 1]);
  });

  it("disables the active cursor for reduced-motion users", () => {
    const states: (number | null)[] = [];
    startListenWordSweep(3, true, (activeWord) => states.push(activeWord));
    vi.runAllTimers();
    expect(states).toEqual([null]);
  });

  it("reveals settled green and honey states left-to-right", () => {
    const settled = [
      { state: "correct" as const },
      { state: "unclear" as const },
      { state: "correct" as const },
    ];
    const reveals: ReturnType<typeof sentenceWordVisualState>[][] = [];
    const record = (revealedWordCount: number) => {
      reveals.push(
        settled.map((_, index) =>
          sentenceWordVisualState(index, null, settled, revealedWordCount),
        ),
      );
    };

    const complete = vi.fn();
    startSettleWordReveal(settled.length, false, record, complete);
    expect(reveals).toEqual([["correct", "neutral", "neutral"]]);
    vi.advanceTimersByTime(SETTLE_WORD_STAGGER_MS);
    expect(reveals.at(-1)).toEqual(["correct", "unclear", "neutral"]);
    vi.advanceTimersByTime(SETTLE_WORD_STAGGER_MS);
    expect(reveals.at(-1)).toEqual(["correct", "unclear", "correct"]);
    expect(complete).toHaveBeenCalledOnce();

    for (const states of reveals) {
      for (const state of states) {
        expect(SENTENCE_WORD_CLASSES[state]).not.toMatch(
          /(?:^|\s)(?:bg|text|border)-(?:danger|red|rose)(?:-|\s|$)/,
        );
      }
    }
  });

  it("reveals every settled word immediately when reduced motion is requested", () => {
    const reveal = vi.fn();
    const complete = vi.fn();

    startSettleWordReveal(4, true, reveal, complete);

    expect(reveal).toHaveBeenCalledExactlyOnceWith(4);
    expect(complete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
