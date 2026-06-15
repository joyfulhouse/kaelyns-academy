// src/components/learner/speak.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { narrate } = vi.hoisted(() => ({ narrate: vi.fn(() => ({ cancel: vi.fn() })) }));
vi.mock("./narrate", () => ({ narrate }));

import { speak, stopSpeaking } from "./speak";

afterEach(() => vi.resetAllMocks());

describe("speak", () => {
  it("routes English narration through narrate() with persist=durable", () => {
    speak("Find the word");
    expect(narrate).toHaveBeenCalledOnce();
    const [text, opts] = narrate.mock.calls[0];
    expect(text).toBe("Find the word");
    expect(opts.persist).toBe("durable");
    expect(typeof opts.onUnavailable).toBe("function");
  });

  it("ignores empty text", () => {
    speak("   ");
    expect(narrate).not.toHaveBeenCalled();
  });

  it("stopSpeaking cancels the active narration", () => {
    const cancel = vi.fn();
    narrate.mockReturnValueOnce({ cancel });
    speak("hello");
    stopSpeaking();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
