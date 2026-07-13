import { describe, expect, it } from "vitest";
import {
  MAX_RECORDING_MS,
  canRecordAnother,
  canSubmitRecording,
  phaseAfterUnmatched,
  sentenceRecordingMs,
} from "./recording";

describe("oral-reading recording lifecycle", () => {
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
