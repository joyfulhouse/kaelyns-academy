import { describe, expect, it } from "vitest";
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
  it("accepts known keys", () => { expect(learnerSettingsSchema.parse({ readAloud: true, aiPractice: true, dailyGoal: 2 }).readAloud).toBe(true); });
});
