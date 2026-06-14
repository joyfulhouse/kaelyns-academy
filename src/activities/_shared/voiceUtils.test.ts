import { describe, it, expect } from "vitest";
import { pickVoice, speechParamsFor, LOCALE_SPEECH_PARAMS } from "./voiceUtils";

/** Minimal stand-in for SpeechSynthesisVoice — pickVoice only reads lang + localService. */
function voice(lang: string, localService = false, name = lang): SpeechSynthesisVoice {
  return {
    lang,
    localService,
    name,
    default: false,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

describe("pickVoice", () => {
  it("prefers an exact lang match over a prefix match", () => {
    const voices = [voice("zh-CN"), voice("zh-TW"), voice("en-US")];
    expect(pickVoice(voices, "zh-TW")?.lang).toBe("zh-TW");
  });

  it("is case-insensitive on the tag", () => {
    const voices = [voice("ZH-tw")];
    expect(pickVoice(voices, "zh-TW")?.lang).toBe("ZH-tw");
  });

  it("prefers the localService voice among exact matches", () => {
    const cloud = voice("en-US", false, "Cloud");
    const onDevice = voice("en-US", true, "OnDevice");
    expect(pickVoice([cloud, onDevice], "en-US")?.name).toBe("OnDevice");
  });

  it("falls back to a language-prefix match when no exact tag exists", () => {
    const voices = [voice("zh-CN"), voice("en-US")];
    expect(pickVoice(voices, "zh-TW")?.lang).toBe("zh-CN"); // zh-TW → any zh
  });

  it("prefers localService within prefix matches too", () => {
    const cloudZh = voice("zh-HK", false, "CloudZh");
    const deviceZh = voice("zh-CN", true, "DeviceZh");
    expect(pickVoice([cloudZh, deviceZh], "zh-TW")?.name).toBe("DeviceZh");
  });

  it("returns null when nothing matches", () => {
    expect(pickVoice([voice("en-US"), voice("es-MX")], "ko-KR")).toBeNull();
  });

  it("returns null for an empty voice list", () => {
    expect(pickVoice([], "en-US")).toBeNull();
  });
});

describe("speechParamsFor", () => {
  it("returns the exact params for a known locale", () => {
    expect(speechParamsFor("zh-TW")).toEqual(LOCALE_SPEECH_PARAMS["zh-TW"]);
    expect(speechParamsFor("ko-KR")).toEqual({ rate: 0.82, pitch: 1.0 });
  });

  it("matches by language prefix when the exact tag is unlisted", () => {
    // es-ES is not a listed key but shares the "es" prefix with es-MX.
    expect(speechParamsFor("es-ES")).toEqual(LOCALE_SPEECH_PARAMS["es-MX"]);
  });

  it("falls back to en-US params for a fully unknown locale", () => {
    expect(speechParamsFor("fr-FR")).toEqual(LOCALE_SPEECH_PARAMS["en-US"]);
  });
});
