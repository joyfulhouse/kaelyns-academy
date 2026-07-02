import { describe, expect, it } from "vitest";
import type { MathClockConfig } from "@/content/activity-configs";
import { isCorrect, score, skillsAffected } from "./logic";

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
  it("set matches the target hour AND minute", () => {
    const c: MathClockConfig = { mode: "set", instruction: "", targetHour: 6, targetMinute: 0 };
    expect(isCorrect(c, { attempts: 1, setHour: 6, setMinute: 0 })).toBe(true);
    expect(isCorrect(c, { attempts: 1, setHour: 6, setMinute: 30 })).toBe(false);
    expect(isCorrect(c, { attempts: 1, setHour: 5, setMinute: 0 })).toBe(false);
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
    expect(score(c, { attempts: 2, setHour: 6, setMinute: 0 })).toEqual({
      correct: 1,
      total: 1,
      stars: 2,
      skillEvidence: [{ skill: "math.time", outcome: "emerging" }],
    });
  });
  it("finished after retries still earns a star (never 0)", () => {
    const c: MathClockConfig = { mode: "set", instruction: "", targetHour: 6, targetMinute: 0 };
    const s = score(c, { attempts: 4, setHour: 6, setMinute: 0 });
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
