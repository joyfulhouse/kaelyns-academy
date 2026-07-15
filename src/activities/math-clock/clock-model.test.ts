import { describe, expect, it } from "vitest";
import {
  anglesForTime,
  normalizeHalfHour,
  pointerAngle,
  snapPointerToHalfHour,
  timeFromTotalMinutes,
  unwrapAngle,
} from "./clock-model";

describe("normalizeHalfHour", () => {
  it("preserves every supported position in one twelve-hour cycle", () => {
    for (let position = 0; position < 24; position += 1) {
      expect(normalizeHalfHour(position * 30)).toBe(position * 30);
    }
  });

  it("rounds to the nearest half-hour and wraps to one cycle", () => {
    expect(normalizeHalfHour(44)).toBe(30);
    expect(normalizeHalfHour(46)).toBe(60);
    expect(normalizeHalfHour(720)).toBe(0);
    expect(normalizeHalfHour(-30)).toBe(690);
  });
});

describe("timeFromTotalMinutes", () => {
  it("converts the noon boundary without exposing hour zero", () => {
    expect(timeFromTotalMinutes(0)).toEqual({ hour: 12, minute: 0 });
    expect(timeFromTotalMinutes(30)).toEqual({ hour: 12, minute: 30 });
    expect(timeFromTotalMinutes(690)).toEqual({ hour: 11, minute: 30 });
    expect(timeFromTotalMinutes(720)).toEqual({ hour: 12, minute: 0 });
  });
});

describe("anglesForTime", () => {
  it("uses six degrees per minute and half a degree per total minute", () => {
    expect(anglesForTime(390)).toEqual({ minuteAngle: 180, hourAngle: 195 });
    expect(anglesForTime(60)).toEqual({ minuteAngle: 0, hourAngle: 30 });
  });
});

describe("pointer geometry", () => {
  const bounds = { left: 10, top: 20, width: 200, height: 200 };

  it("measures clockwise degrees with twelve o'clock as zero", () => {
    expect(pointerAngle(110, 20, bounds)).toBeCloseTo(0);
    expect(pointerAngle(210, 120, bounds)).toBeCloseTo(90);
    expect(pointerAngle(110, 220, bounds)).toBeCloseTo(180);
    expect(pointerAngle(10, 120, bounds)).toBeCloseTo(270);
  });

  it("unwraps clockwise and counter-clockwise movement across zero", () => {
    expect(unwrapAngle(350, 10)).toBe(370);
    expect(unwrapAngle(10, 350)).toBe(-10);
    expect(unwrapAngle(710, 0)).toBe(720);
  });

  it("snaps either hand's pointer delta to canonical half-hours", () => {
    expect(snapPointerToHalfHour(0, 170, "minute")).toBe(30);
    expect(snapPointerToHalfHour(30, -170, "minute")).toBe(0);
    expect(snapPointerToHalfHour(0, 14, "hour")).toBe(30);
    expect(snapPointerToHalfHour(690, 20, "hour")).toBe(0);
  });
});
