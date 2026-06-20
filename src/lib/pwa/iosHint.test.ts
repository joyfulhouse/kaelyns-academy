import { describe, expect, it } from "vitest";
import { shouldShowIosHint } from "./iosHint";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const base = { isStandalone: false, dismissed: false, maxTouchPoints: 5 };

describe("shouldShowIosHint", () => {
  it("shows on iPhone Safari (not installed, not dismissed)", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IPHONE })).toBe(true);
  });
  it("shows on iPadOS reporting the desktop UA (touch points > 1)", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 })).toBe(true);
  });
  it("hides once installed (standalone) or dismissed", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IPHONE, isStandalone: true })).toBe(false);
    expect(shouldShowIosHint({ ...base, userAgent: IPHONE, dismissed: true })).toBe(false);
  });
  it("hides on iOS Chrome, Android, and desktop Safari (no touch)", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IOS_CHROME })).toBe(false);
    expect(shouldShowIosHint({ ...base, userAgent: ANDROID })).toBe(false);
    expect(shouldShowIosHint({ ...base, userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(false);
  });
});
