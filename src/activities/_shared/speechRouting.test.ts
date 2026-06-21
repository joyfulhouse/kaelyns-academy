import { describe, expect, it, vi } from "vitest";
import { BASE_LOCALE, isEnglishLocale, localeForRole, routeSpeak, type SpeakRouter } from "./speechRouting";

describe("isEnglishLocale", () => {
  it("matches en* case-insensitively, rejects others", () => {
    expect(isEnglishLocale("en-US")).toBe(true);
    expect(isEnglishLocale("EN-GB")).toBe(true);
    expect(isEnglishLocale("ko-KR")).toBe(false);
    expect(isEnglishLocale("es-MX")).toBe(false);
  });
});

describe("localeForRole", () => {
  it("voices instructions in the base (English) language but content in the target locale", () => {
    // An English instruction read with the target voice (the bug) mangles it.
    expect(localeForRole("ko-KR", "instruction")).toBe(BASE_LOCALE);
    expect(localeForRole("ko-KR", "content")).toBe("ko-KR");
    expect(localeForRole("zh-TW", "instruction")).toBe("en-US");
    expect(localeForRole("ja-JP", "content")).toBe("ja-JP");
  });

  it("is a no-op for an English-target activity", () => {
    expect(localeForRole("en-US", "instruction")).toBe("en-US");
    expect(localeForRole("en-US", "content")).toBe("en-US");
  });
});

describe("routeSpeak", () => {
  it("English → narrate(durable), not synth; returns a handle", () => {
    const narrate = vi.fn<SpeakRouter["narrate"]>(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    const handle = routeSpeak("en-US", "Find the word", { narrate, speakViaSynth });
    expect(narrate).toHaveBeenCalledOnce();
    expect(narrate.mock.calls[0]![1].persist).toBe("durable");
    expect(speakViaSynth).not.toHaveBeenCalled();
    expect(handle).not.toBeNull();
  });

  it("non-English → synth, not narrate; returns null", () => {
    const narrate = vi.fn<SpeakRouter["narrate"]>(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    const handle = routeSpeak("ko-KR", "안녕", { narrate, speakViaSynth });
    expect(speakViaSynth).toHaveBeenCalledWith("안녕");
    expect(narrate).not.toHaveBeenCalled();
    expect(handle).toBeNull();
  });

  it("English onUnavailable falls back to synth", () => {
    const narrate = vi.fn<SpeakRouter["narrate"]>((_t, opts) => {
      opts.onUnavailable();
      return { cancel: vi.fn() };
    });
    const speakViaSynth = vi.fn();
    routeSpeak("en-GB", "hi", { narrate, speakViaSynth });
    expect(speakViaSynth).toHaveBeenCalledWith("hi");
  });

  it("English with a phoneme override → neural gets the override, synth fallback gets the plain text", () => {
    // A lone tile mis-phonemizes ("ble" → "blee"); the override fixes the neural
    // voice, but the browser-synth fallback must NEVER read the markup aloud.
    const narrate = vi.fn<SpeakRouter["narrate"]>((_t, opts) => {
      opts.onUnavailable();
      return { cancel: vi.fn() };
    });
    const speakViaSynth = vi.fn();
    routeSpeak("en-US", "ble", { narrate, speakViaSynth }, { tts: "[ble](/bəl/)" });
    expect(narrate.mock.calls[0]![0]).toBe("[ble](/bəl/)");
    expect(speakViaSynth).toHaveBeenCalledWith("ble");
  });

  it("non-English ignores the tts override (Web Speech can't read phoneme markup)", () => {
    const narrate = vi.fn<SpeakRouter["narrate"]>(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    routeSpeak("ko-KR", "안녕", { narrate, speakViaSynth }, { tts: "[x](/y/)" });
    expect(speakViaSynth).toHaveBeenCalledWith("안녕");
    expect(narrate).not.toHaveBeenCalled();
  });

  it("empty text → no-op, null", () => {
    const narrate = vi.fn<SpeakRouter["narrate"]>(() => ({ cancel: vi.fn() }));
    const speakViaSynth = vi.fn();
    expect(routeSpeak("en-US", "   ", { narrate, speakViaSynth })).toBeNull();
    expect(narrate).not.toHaveBeenCalled();
    expect(speakViaSynth).not.toHaveBeenCalled();
  });
});
