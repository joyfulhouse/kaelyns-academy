import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";
import type { SortCategoriesConfig } from "@/content/activity-configs";

const cfg: SortCategoriesConfig = {
  instruction: "Sort the animals.",
  bins: [
    { id: "land", label: "Land", emoji: "🌳" },
    { id: "water", label: "Water", emoji: "🌊" },
  ],
  items: [
    { label: "Frog", emoji: "🐸", binId: "water" },
    { label: "Dog", emoji: "🐶", binId: "land" },
    { label: "Fish", emoji: "🐟", binId: "water" },
  ],
};

describe("isCorrect", () => {
  it("is true when every item's placement matches its binId", () => {
    expect(isCorrect(cfg, { attempts: 1, placements: ["water", "land", "water"] })).toBe(true);
  });
  it("is false on a misplaced item or an incomplete placement", () => {
    expect(isCorrect(cfg, { attempts: 1, placements: ["land", "land", "water"] })).toBe(false);
    expect(isCorrect(cfg, { attempts: 1, placements: ["water", "land"] })).toBe(false);
  });
});

describe("score", () => {
  it("first-try correct → 3 stars solid on science.classify", () => {
    expect(score(cfg, { attempts: 1, placements: ["water", "land", "water"] })).toEqual({
      correct: 1, total: 1, stars: 3,
      skillEvidence: [{ skill: "science.classify", outcome: "solid" }],
    });
  });
  it("finished after retries still earns a star (never 0)", () => {
    const s = score(cfg, { attempts: 3, placements: ["water", "land", "water"] });
    expect(s.correct).toBe(1); expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always science.classify", () => {
    expect(skillsAffected(cfg)).toEqual(["science.classify"]);
  });
});
