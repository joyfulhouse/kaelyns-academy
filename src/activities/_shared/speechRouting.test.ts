import { describe, expect, it, vi } from "vitest";
import { isEnglishLocale, routeSpeak } from "./speechRouting";

describe("isEnglishLocale", () => {
  it("matches en* case-insensitively, rejects others", () => {
    expect(isEnglishLocale("en-US")).toBe(true);
    expect(isEnglishLocale("EN-GB")).toBe(true);
    expect(isEnglishLocale("ko-KR")).toBe(false);
    expect(isEnglishLocale("es-MX")).toBe(false);
  });
});

describe("routeSpeak", () => {
  it("English → narrate(durable), not synth; returns a handle", () => {
    const narrate = vi.fn(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    const handle = routeSpeak("en-US", "Find the word", { narrate, speakViaSynth });
    expect(narrate).toHaveBeenCalledOnce();
    expect(narrate.mock.calls[0]![1].persist).toBe("durable");
    expect(speakViaSynth).not.toHaveBeenCalled();
    expect(handle).not.toBeNull();
  });

  it("non-English → synth, not narrate; returns null", () => {
    const narrate = vi.fn(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    const handle = routeSpeak("ko-KR", "안녕", { narrate, speakViaSynth });
    expect(speakViaSynth).toHaveBeenCalledWith("안녕");
    expect(narrate).not.toHaveBeenCalled();
    expect(handle).toBeNull();
  });

  it("English onUnavailable falls back to synth", () => {
    const narrate = vi.fn((_t: string, opts: { onUnavailable: () => void }) => {
      opts.onUnavailable();
      return { cancel: vi.fn() };
    });
    const speakViaSynth = vi.fn();
    routeSpeak("en-GB", "hi", { narrate, speakViaSynth });
    expect(speakViaSynth).toHaveBeenCalledWith("hi");
  });

  it("empty text → no-op, null", () => {
    const narrate = vi.fn(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    expect(routeSpeak("en-US", "   ", { narrate, speakViaSynth })).toBeNull();
    expect(narrate).not.toHaveBeenCalled();
    expect(speakViaSynth).not.toHaveBeenCalled();
  });
});
