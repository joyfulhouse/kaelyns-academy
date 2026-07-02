import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";

const compareCfg = {
  mode: "compare" as const,
  instruction: "",
  attribute: "length" as const,
  question: "most" as const,
  items: [
    { label: "pencil", emoji: "✏️", size: 3 },
    { label: "crayon", emoji: "🖍️", size: 2 },
  ],
  answerIndex: 0,
};
const unitsCfg = {
  mode: "units" as const,
  instruction: "",
  unit: "cube" as const,
  length: 5,
  choices: [4, 5, 6],
  answerIndex: 1,
};

describe("isCorrect", () => {
  it("both modes match the selected choice index", () => {
    expect(isCorrect(compareCfg, { attempts: 1, selectedIndex: 0 })).toBe(true);
    expect(isCorrect(compareCfg, { attempts: 1, selectedIndex: 1 })).toBe(false);
    expect(isCorrect(unitsCfg, { attempts: 1, selectedIndex: 1 })).toBe(true);
  });
});

describe("score", () => {
  it("first-try → 3 stars solid on math.measure", () => {
    expect(score(compareCfg, { attempts: 1, selectedIndex: 0 })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "math.measure", outcome: "solid" }],
    });
  });
  it("second try → 2 stars emerging", () => {
    const s = score(unitsCfg, { attempts: 2, selectedIndex: 1 });
    expect(s.stars).toBe(2);
    expect(s.skillEvidence[0].outcome).toBe("emerging");
  });
  it("third+ try → 1 star not_yet", () => {
    const s = score(unitsCfg, { attempts: 3, selectedIndex: 1 });
    expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
  it("wrong final selection → 1 star not_yet (never a failure)", () => {
    const s = score(compareCfg, { attempts: 4, selectedIndex: 1 });
    expect(s.correct).toBe(0);
    expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always math.measure", () => {
    expect(skillsAffected(unitsCfg)).toEqual(["math.measure"]);
    expect(skillsAffected(compareCfg)).toEqual(["math.measure"]);
  });
});
