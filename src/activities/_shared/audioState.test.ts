import { describe, expect, it } from "vitest";
import {
  audioPlaybackReducer,
  initialAudioPlaybackState,
  type AudioRequest,
} from "./audioState";

const request: AudioRequest = {
  audioKey: "zhuyin-b",
  text: "ㄅㄛ",
};

describe("audioPlaybackReducer", () => {
  it("moves a successful clip from playing to completed", () => {
    const playing = audioPlaybackReducer(initialAudioPlaybackState, {
      type: "play",
      requestId: 1,
      request,
    });
    const completed = audioPlaybackReducer(playing, { type: "finished", requestId: 1 });

    expect(playing.status).toBe("playing");
    expect(completed.status).toBe("completed");
  });

  it("keeps playback pending while a failed clip falls back to TTS", () => {
    const playing = audioPlaybackReducer(initialAudioPlaybackState, {
      type: "play",
      requestId: 1,
      request,
    });
    const fallback = audioPlaybackReducer(playing, {
      type: "fallback",
      requestId: 1,
    });

    expect(fallback).toMatchObject({
      status: "playing",
      requestId: 1,
      lastRequest: request,
    });
  });

  it("reports unavailable when both the clip and TTS are unavailable", () => {
    const playing = audioPlaybackReducer(initialAudioPlaybackState, {
      type: "play",
      requestId: 1,
      request,
    });

    expect(
      audioPlaybackReducer(playing, {
        type: "unavailable",
        requestId: 1,
      }).status,
    ).toBe("unavailable");
  });

  it("replays the last request with a new request id after failure", () => {
    const unavailable = audioPlaybackReducer(
      audioPlaybackReducer(initialAudioPlaybackState, {
        type: "play",
        requestId: 1,
        request,
      }),
      { type: "unavailable", requestId: 1 },
    );
    const replaying = audioPlaybackReducer(unavailable, { type: "retry", requestId: 2 });

    expect(replaying).toMatchObject({
      status: "playing",
      requestId: 2,
      lastRequest: request,
    });
  });

  it("lets stop supersede the current request", () => {
    const playing = audioPlaybackReducer(initialAudioPlaybackState, {
      type: "play",
      requestId: 1,
      request,
    });

    expect(audioPlaybackReducer(playing, { type: "stop", requestId: 2 })).toMatchObject({
      status: "idle",
      requestId: 2,
      lastRequest: request,
    });
  });

  it("returns a locale-cancelled fallback request to idle", () => {
    const playing = audioPlaybackReducer(initialAudioPlaybackState, {
      type: "play",
      requestId: 1,
      request,
    });
    const fallback = audioPlaybackReducer(playing, { type: "fallback", requestId: 1 });

    expect(audioPlaybackReducer(fallback, { type: "cancelled", requestId: 1 })).toMatchObject({
      status: "idle",
      requestId: 1,
      lastRequest: request,
    });
  });

  it("ignores stale async completion after a new item starts", () => {
    const first = audioPlaybackReducer(initialAudioPlaybackState, {
      type: "play",
      requestId: 1,
      request,
    });
    const secondRequest = { audioKey: "zhuyin-p", text: "ㄆㄛ" };
    const second = audioPlaybackReducer(first, {
      type: "play",
      requestId: 2,
      request: secondRequest,
    });

    expect(audioPlaybackReducer(second, { type: "finished", requestId: 1 })).toBe(second);
    expect(
      audioPlaybackReducer(second, { type: "unavailable", requestId: 1 }),
    ).toBe(second);
  });
});
