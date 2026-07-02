import { describe, expect, it } from "vitest";
import { parseBonusAmount } from "./RewardsPanel";

// parseBonusAmount is the single source of truth for the "give bonus stars"
// field: the same result drives both the inline error and the submitted value,
// mirroring EnrollmentConfigForm's parseDailyGoal contract (see that test's
// header comment). Only plain whole numbers in [1, 20] are valid; browser-
// accepted numeric syntax (exponents, decimals, signs) must be REJECTED, not
// silently coerced.

describe("parseBonusAmount", () => {
  it("accepts plain whole numbers across the [1, 20] range", () => {
    expect(parseBonusAmount("1")).toEqual({ value: 1, valid: true });
    expect(parseBonusAmount("5")).toEqual({ value: 5, valid: true });
    expect(parseBonusAmount("20")).toEqual({ value: 20, valid: true });
    expect(parseBonusAmount(" 7 ")).toEqual({ value: 7, valid: true });
  });

  it("rejects zero and out-of-range whole numbers", () => {
    expect(parseBonusAmount("0")).toEqual({ value: undefined, valid: false });
    expect(parseBonusAmount("21")).toEqual({ value: undefined, valid: false });
    expect(parseBonusAmount("100")).toEqual({ value: undefined, valid: false });
  });

  it("rejects empty / whitespace (no implicit default, unlike an optional field)", () => {
    expect(parseBonusAmount("")).toEqual({ value: undefined, valid: false });
    expect(parseBonusAmount("   ")).toEqual({ value: undefined, valid: false });
  });

  it("rejects exponent notation instead of coercing it", () => {
    // Number("1e1") === 10, which would silently pass as valid if we validated
    // with Number() — must be rejected so validation and submission agree.
    expect(parseBonusAmount("1e1")).toEqual({ value: undefined, valid: false });
  });

  it("rejects decimals, signs, and non-numeric text", () => {
    for (const bad of ["5.5", "2.0", "-3", "+4", "abc", "0x10", "3,5"]) {
      expect(parseBonusAmount(bad)).toEqual({ value: undefined, valid: false });
    }
  });

  it("accepts redundant leading zeros as their numeric value", () => {
    expect(parseBonusAmount("007")).toEqual({ value: 7, valid: true });
  });
});
