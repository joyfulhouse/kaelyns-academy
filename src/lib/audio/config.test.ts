// src/lib/audio/config.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DURABLE_PREFIX,
  EPHEMERAL_PREFIX,
  clipObjectPath,
  clipPublicUrl,
  enSpeed,
  enVoice,
  prefixFor,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("audio config", () => {
  it("maps persist tiers to prefixes", () => {
    expect(prefixFor("durable")).toBe(DURABLE_PREFIX);
    expect(prefixFor("ephemeral")).toBe(EPHEMERAL_PREFIX);
    expect(prefixFor(undefined)).toBe(DURABLE_PREFIX); // default durable
  });

  it("builds object paths and public urls from a key", () => {
    expect(clipObjectPath("en", "abc")).toBe("en/abc.mp3");
    expect(clipObjectPath("en/cache", "abc")).toBe("en/cache/abc.mp3");
    expect(clipPublicUrl("en", "abc")).toBe("/audio/en/abc.mp3");
  });

  it("honors NEXT_PUBLIC_AUDIO_BASE_URL for public urls", () => {
    vi.stubEnv("NEXT_PUBLIC_AUDIO_BASE_URL", "https://cdn.example.com/clips/");
    expect(clipPublicUrl("en", "abc")).toBe("https://cdn.example.com/clips/en/abc.mp3");
  });

  it("defaults voice/speed but honors env overrides", () => {
    expect(enVoice()).toBe("af_heart");
    expect(enSpeed()).toBe(0.9);
    vi.stubEnv("KOKORO_EN_VOICE", "af_bella");
    vi.stubEnv("KOKORO_EN_SPEED", "1.05");
    expect(enVoice()).toBe("af_bella");
    expect(enSpeed()).toBe(1.05);
  });
});
