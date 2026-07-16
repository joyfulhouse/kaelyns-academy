import { describe, expect, it } from "vitest";
import type { MathClockConfig } from "@/content/activity-configs";
import { isCorrect, responseSchema, score, skillsAffected, validateGenerated } from "./logic";

describe("isCorrect", () => {
  it("read matches the chosen digital time index", () => {
    const c: MathClockConfig = {
      mode: "read",
      instruction: "",
      hour: 3,
      minute: 30,
      choices: ["3:00", "3:30"],
      answerIndex: 1,
    };
    expect(isCorrect(c, { attempts: 1, selectedIndex: 1 })).toBe(true);
    expect(isCorrect(c, { attempts: 1, selectedIndex: 0 })).toBe(false);
  });
  it("set matches the target's canonical half-hour", () => {
    const c: MathClockConfig = { mode: "set", instruction: "", targetHour: 6, targetMinute: 0 };
    expect(isCorrect(c, { attempts: 1, totalMinutes: 360 })).toBe(true);
    expect(isCorrect(c, { attempts: 1, totalMinutes: 390 })).toBe(false);
    expect(isCorrect(c, { attempts: 1, totalMinutes: 300 })).toBe(false);
  });
});

describe("responseSchema", () => {
  it("accepts only a canonical set time and bounded attempts", () => {
    expect(responseSchema.safeParse({ attempts: 1, totalMinutes: 690 }).success).toBe(true);
    expect(responseSchema.safeParse({ attempts: 1, totalMinutes: 45 }).success).toBe(false);
    expect(responseSchema.safeParse({ attempts: 1, totalMinutes: 720 }).success).toBe(false);
    expect(responseSchema.safeParse({ attempts: 21, totalMinutes: 0 }).success).toBe(false);
    expect(responseSchema.safeParse({ attempts: 1, setHour: 12, setMinute: 0 }).success).toBe(
      false,
    );
  });

  it("bounds read selections to the authored choice capacity", () => {
    expect(responseSchema.safeParse({ attempts: 1, selectedIndex: 3 }).success).toBe(true);
    expect(responseSchema.safeParse({ attempts: 1, selectedIndex: 4 }).success).toBe(false);
  });
});

describe("score", () => {
  it("first-try read → 3 stars solid on math.time", () => {
    const c: MathClockConfig = {
      mode: "read",
      instruction: "",
      hour: 3,
      minute: 0,
      choices: ["3:00", "4:00"],
      answerIndex: 0,
    };
    expect(score(c, { attempts: 1, selectedIndex: 0 })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.time", outcome: "solid" }],
    });
  });
  it("second-try set → 2 stars emerging on math.time", () => {
    const c: MathClockConfig = { mode: "set", instruction: "", targetHour: 6, targetMinute: 0 };
    expect(score(c, { attempts: 2, totalMinutes: 360 })).toEqual({
      correct: 1,
      total: 1,
      stars: 2,
      skillEvidence: [{ skill: "math.time", outcome: "emerging" }],
    });
  });
  it("finished after retries still earns a star (never 0)", () => {
    const c: MathClockConfig = { mode: "set", instruction: "", targetHour: 6, targetMinute: 0 };
    const s = score(c, { attempts: 4, totalMinutes: 360 });
    expect(s.correct).toBe(1);
    expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always math.time", () => {
    expect(skillsAffected({ mode: "set", instruction: "", targetHour: 1, targetMinute: 0 })).toEqual([
      "math.time",
    ]);
  });
});

describe("validateGenerated (B3 answer-key net)", () => {
  const read = { mode: "read" as const, instruction: "", hour: 3, minute: 0 as const };
  it("accepts a read item whose marked choice is the true time", () => {
    expect(validateGenerated({ ...read, choices: ["3:00", "4:00"], answerIndex: 0 })).toBeNull();
  });
  it("rejects a read item whose marked choice is the wrong time", () => {
    expect(validateGenerated({ ...read, choices: ["4:00", "3:00"], answerIndex: 0 })).not.toBeNull();
  });
  it("has no answer key to check in set mode", () => {
    expect(
      validateGenerated({ mode: "set", instruction: "", targetHour: 1, targetMinute: 0 }),
    ).toBeNull();
  });
});
