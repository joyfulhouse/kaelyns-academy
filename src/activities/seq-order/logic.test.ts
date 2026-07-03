import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";
import type { SeqOrderConfig } from "@/content/activity-configs";

const cfg: SeqOrderConfig = {
  instruction: "Put the life cycle in order.",
  cards: [
    { label: "Egg", emoji: "🥚" },
    { label: "Caterpillar", emoji: "🐛" },
    { label: "Chrysalis", emoji: "🛡️" },
    { label: "Butterfly", emoji: "🦋" },
  ],
};

describe("isCorrect", () => {
  it("is true when the tapped order equals the array (config) order", () => {
    expect(isCorrect(cfg, { attempts: 1, order: [0, 1, 2, 3] })).toBe(true);
  });
  it("is false on a wrong order or an incomplete sequence", () => {
    expect(isCorrect(cfg, { attempts: 1, order: [0, 2, 1, 3] })).toBe(false);
    expect(isCorrect(cfg, { attempts: 1, order: [0, 1, 2] })).toBe(false);
  });
});

describe("score", () => {
  it("first-try correct → 3 stars solid on science.sequence", () => {
    expect(score(cfg, { attempts: 1, order: [0, 1, 2, 3] })).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "science.sequence", outcome: "solid" }],
    });
  });
  it("second attempt → 2 stars emerging", () => {
    const s = score(cfg, { attempts: 2, order: [0, 1, 2, 3] });
    expect(s.stars).toBe(2);
    expect(s.skillEvidence[0].outcome).toBe("emerging");
  });
});

describe("skillsAffected", () => {
  it("is always science.sequence", () => {
    expect(skillsAffected(cfg)).toEqual(["science.sequence"]);
  });
});
