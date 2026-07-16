import { describe, expect, it, vi } from "vitest";
import {
  MAX_RECORDING_MS,
  canRecordAnother,
  canSubmitRecording,
  createOralReadingRequestForm,
  canExposeModelAudio,
  canStartOralAttempt,
  parseWordRouteResult,
  needsAdultModelFallback,
  isModelPlaybackLocked,
  phaseAfterUnmatched,
  sentenceRecordingMs,
  shouldCompleteAfterObservation,
  stopModelAudioBeforeRecording,
} from "./recording";

describe("oral-reading recording lifecycle", () => {
  it("gates modeled attempts and keeps cold assessments unmodeled", () => {
    expect(canStartOralAttempt("listen-repeat", false)).toBe(false);
    expect(canStartOralAttempt("listen-repeat", true)).toBe(true);
    expect(canStartOralAttempt("cold", false)).toBe(true);

    expect(canExposeModelAudio("cold")).toBe(false);
    expect(canExposeModelAudio("listen-repeat")).toBe(true);
    expect(needsAdultModelFallback("listen-repeat", false)).toBe(true);
    expect(needsAdultModelFallback("listen-repeat", true)).toBe(false);
    expect(needsAdultModelFallback("cold", false)).toBe(false);
  });

  it("locks model replay for every microphone-owned phase", () => {
    expect(isModelPlaybackLocked("ready")).toBe(false);
    expect(isModelPlaybackLocked("unclear")).toBe(false);
    expect(isModelPlaybackLocked("fallback")).toBe(false);
    expect(isModelPlaybackLocked("requesting")).toBe(true);
    expect(isModelPlaybackLocked("listening")).toBe(true);
    expect(isModelPlaybackLocked("checking")).toBe(true);
  });

  it("stops model audio and its visual sweep before requesting the microphone", () => {
    const cancelSpeech = vi.fn();
    const cancelVisualSweep = vi.fn();

    stopModelAudioBeforeRecording(cancelSpeech, cancelVisualSweep);

    expect(cancelVisualSweep).toHaveBeenCalledOnce();
    expect(cancelSpeech).toHaveBeenCalledOnce();
  });

  it("settles a cold assessment on its first observation", () => {
    expect(shouldCompleteAfterObservation("cold", "matched")).toBe(true);
    expect(shouldCompleteAfterObservation("cold", "unclear")).toBe(true);
    expect(shouldCompleteAfterObservation("cold", "no-speech")).toBe(true);
    expect(shouldCompleteAfterObservation("listen-repeat", "matched")).toBe(true);
    expect(shouldCompleteAfterObservation("listen-repeat", "unclear")).toBe(false);
    expect(shouldCompleteAfterObservation("listen-repeat", "no-speech")).toBe(false);
  });

  it("uploads audio with exact authored identity and no client target or passage", () => {
    const form = createOralReadingRequestForm(new Blob(["audio"]), {
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      unitKey: "unit-1",
      activityId: "oral-1",
    });
    expect(form && [...form.keys()].sort()).toEqual([
      "activityId",
      "file",
      "learnerId",
      "programSlug",
      "unitKey",
    ]);
    expect(form?.has("target")).toBe(false);
    expect(form?.has("passage")).toBe(false);
    expect(
      createOralReadingRequestForm(new Blob(["audio"]), {
        learnerId: "L1",
        programSlug: "kaelyn-adaptive",
      }),
    ).toBeNull();
  });

  it("accepts a verified word result only with a bounded opaque witness", () => {
    expect(
      parseWordRouteResult({
        result: "matched",
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toEqual({
      result: "matched",
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(parseWordRouteResult({ result: "matched" })).toBe("unavailable");
    expect(
      parseWordRouteResult({ result: "matched", verificationId: "forged" }),
    ).toBe("unavailable");
  });

  it("never submits an empty recording or a recorder stopped during unmount", () => {
    expect(canSubmitRecording(true, 8)).toBe(true);
    expect(canSubmitRecording(true, 0)).toBe(false);
    expect(canSubmitRecording(false, 8)).toBe(false);
    expect(canSubmitRecording(true, 8, true)).toBe(false);
  });

  it("caps recordings at two uploads, counting unavailable verifications", () => {
    // The counter tracks uploads, not tri-state results — an "unavailable"
    // gateway response consumed a recording and an STT call, so it must not
    // grant an extra try around the cap.
    expect(canRecordAnother(0)).toBe(true);
    expect(canRecordAnother(1)).toBe(true);
    expect(canRecordAnother(2)).toBe(false);
    expect(canRecordAnother(3)).toBe(false);
  });

  it("offers one honey retry, then routes to the grown-up path", () => {
    expect(phaseAfterUnmatched(1)).toBe("unclear");
    expect(phaseAfterUnmatched(2)).toBe("fallback");
    expect(phaseAfterUnmatched(3)).toBe("fallback");
  });

  it("keeps word mode at eight seconds and gives sentences a bounded slow-reader window", () => {
    expect(MAX_RECORDING_MS).toBe(8_000);
    expect(sentenceRecordingMs(1)).toBe(8_000);
    expect(sentenceRecordingMs(2)).toBe(11_000);
    expect(sentenceRecordingMs(5)).toBe(18_000);
    // The longest allowed passage (7 words) at the 30 WCPM target needs ~14s of
    // reading; the 18s ceiling accommodates it plus the setup margin, so a
    // genuine target-pace reader is never truncated by the mic-open window.
    expect(sentenceRecordingMs(7)).toBe(18_000);
    expect(7 * 2_000).toBeLessThanOrEqual(sentenceRecordingMs(7));
  });
});
