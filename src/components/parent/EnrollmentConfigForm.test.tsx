import { describe, expect, it } from "vitest";
import { parseDailyGoal } from "./EnrollmentConfigForm";

// parseDailyGoal is the single source of truth for the daily-goal field: the
// same result drives both the inline error and the persisted value, so the UI
// can never show "valid" while saving a different number. The contract that
// matters: only plain whole numbers in [0, 50] are valid; browser-accepted
// numeric syntax (exponents, decimals, signs) must be REJECTED, not silently
// coerced (the old code validated with Number() but saved with parseInt(), so
// "1e1" passed as 10 yet persisted as 1).

describe("parseDailyGoal", () => {
  it("treats empty / whitespace as 'use the default' (valid, no value)", () => {
    expect(parseDailyGoal("")).toEqual({ value: undefined, valid: true });
    expect(parseDailyGoal("   ")).toEqual({ value: undefined, valid: true });
  });

  it("accepts plain whole numbers across the [0, 50] range", () => {
    expect(parseDailyGoal("0")).toEqual({ value: 0, valid: true });
    expect(parseDailyGoal("5")).toEqual({ value: 5, valid: true });
    expect(parseDailyGoal("50")).toEqual({ value: 50, valid: true });
    expect(parseDailyGoal(" 7 ")).toEqual({ value: 7, valid: true });
  });

  it("rejects exponent notation instead of coercing it (the regression)", () => {
    // Number("1e1") === 10 but parseInt("1e1", 10) === 1 — must be rejected so
    // validation and persistence agree.
    expect(parseDailyGoal("1e1")).toEqual({ value: undefined, valid: false });
    expect(parseDailyGoal("2e1")).toEqual({ value: undefined, valid: false });
    expect(parseDailyGoal("5e1")).toEqual({ value: undefined, valid: false });
  });

  it("rejects decimals, signs, and non-numeric text", () => {
    for (const bad of ["5.5", "2.0", "-3", "+4", "abc", "1.0e1", "0x10", "3,5"]) {
      expect(parseDailyGoal(bad)).toEqual({ value: undefined, valid: false });
    }
  });

  it("rejects out-of-range whole numbers", () => {
    expect(parseDailyGoal("51")).toEqual({ value: undefined, valid: false });
    expect(parseDailyGoal("100")).toEqual({ value: undefined, valid: false });
  });

  it("accepts redundant leading zeros as their numeric value", () => {
    // Digit-only, in range: "007" -> 7. Acceptable; not a coercion hazard.
    expect(parseDailyGoal("007")).toEqual({ value: 7, valid: true });
  });
});
