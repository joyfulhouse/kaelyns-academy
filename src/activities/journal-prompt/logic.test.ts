import { describe, it, expect } from "vitest";
import { score, skillsAffected } from "./logic";
import type { JournalPromptConfig } from "@/content/activity-configs";

const config: JournalPromptConfig = {
  prompt: "Draw your favorite animal.",
  sentenceStarter: "My favorite animal is",
  drawing: true,
};

describe("journal-prompt score", () => {
  it("always awards 3 stars (expression, not graded)", () => {
    const blank = score(config, { text: "", didDraw: false });
    const full = score(config, { text: "My favorite animal is a cat", didDraw: true });
    expect(blank.stars).toBe(3);
    expect(full.stars).toBe(3);
    expect(blank.correct).toBe(1);
    expect(blank.total).toBe(1);
  });

  it("marks writing + stamina skills solid", () => {
    const result = score(config, { text: "hi", didDraw: true });
    expect(result.skillEvidence).toEqual([
      { skill: "writing.sentence", outcome: "solid" },
      { skill: "habits.stamina", outcome: "solid" },
    ]);
  });

  it("reports the writing + stamina skill tags", () => {
    expect(skillsAffected(config)).toEqual(["writing.sentence", "habits.stamina"]);
  });
});
