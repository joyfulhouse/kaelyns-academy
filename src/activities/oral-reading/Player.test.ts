import { describe, expect, it } from "vitest";
import { canRecordAnother, canSubmitRecording, phaseAfterUnmatched } from "./Player";

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
});
