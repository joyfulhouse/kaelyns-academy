import { describe, expect, it } from "vitest";
import { shouldAutoRead } from "./config";
import { enrollmentConfigSchema, learnerSettingsSchema } from "./config";

describe("enrollmentConfigSchema", () => {
  it("accepts a full config", () => {
    const r = enrollmentConfigSchema.parse({ band: "stretch", activeUnitKeys: ["reading"], aiPractice: false, dailyGoal: 3 });
    expect(r.activeUnitKeys).toEqual(["reading"]);
  });
  it("accepts an empty config", () => { expect(enrollmentConfigSchema.parse({})).toEqual({}); });
  it("rejects a bad band", () => { expect(() => enrollmentConfigSchema.parse({ band: "hard" })).toThrow(); });
  it("rejects a negative daily goal", () => { expect(() => enrollmentConfigSchema.parse({ dailyGoal: -1 })).toThrow(); });
});
describe("learnerSettingsSchema", () => {
  it("accepts known keys", () => { expect(learnerSettingsSchema.parse({ readAloud: true, aiPractice: true, oralReading: true, dailyGoal: 2 }).oralReading).toBe(true); });
  it("defaults oral reading off when the setting is absent", () => {
    expect(learnerSettingsSchema.parse({}).oralReading).toBe(false);
  });
});

describe("automatic read-aloud surface gate", () => {
  it("waits for account settings, honors false, and keeps guest default-on", () => {
    expect(shouldAutoRead("loading", false, undefined)).toBe(false);
    expect(shouldAutoRead("account", false, undefined)).toBe(false);
    expect(shouldAutoRead("account", true, false)).toBe(false);
    expect(shouldAutoRead("account", true, true)).toBe(true);
    expect(shouldAutoRead("guest", true, undefined)).toBe(true);
  });
});
