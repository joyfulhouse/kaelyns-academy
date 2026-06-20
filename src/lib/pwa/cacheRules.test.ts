import { describe, expect, it } from "vitest";
import { isAudioRequest, isImmutableStaticAsset } from "./cacheRules";

const u = (s: string) => new URL(s);

describe("isAudioRequest", () => {
  it("matches same-origin /audio clips", () => {
    expect(isAudioRequest(u("https://app/audio/en-US/k.m4a"), true)).toBe(true);
    expect(isAudioRequest(u("https://app/audio/en/cache/abc.mp3"), true)).toBe(true);
  });
  it("rejects non-audio, the TTS POST route, and cross-origin", () => {
    expect(isAudioRequest(u("https://app/api/tts"), true)).toBe(false);
    expect(isAudioRequest(u("https://app/learn"), true)).toBe(false);
    expect(isAudioRequest(u("https://cdn/audio/en/x.m4a"), false)).toBe(false);
  });
});

describe("isImmutableStaticAsset", () => {
  it("matches same-origin /_next/static (hashed JS/CSS/fonts)", () => {
    expect(isImmutableStaticAsset(u("https://app/_next/static/chunks/x.js"), true)).toBe(true);
    expect(isImmutableStaticAsset(u("https://app/_next/static/media/font.woff2"), true)).toBe(true);
  });
  it("rejects HTML, RSC, and cross-origin", () => {
    expect(isImmutableStaticAsset(u("https://app/learn"), true)).toBe(false);
    expect(isImmutableStaticAsset(u("https://app/_next/static/x.js"), false)).toBe(false);
  });
});
