import { describe, it, expect } from "vitest";
import { schema, score, skillsAffected } from "./logic";
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

describe("journal-prompt compose mode (writing bridge)", () => {
  it("defaults mode to draw and allowModes to [type], preserving draw activities", () => {
    const parsed = schema.parse({ prompt: "Tell me about it." });
    expect(parsed.mode).toBe("draw");
    expect(parsed.drawing).toBe(true);
    expect(parsed.allowModes).toEqual(["type"]);
    expect(parsed.frames).toEqual([]);
    expect(parsed.wordBank).toEqual([]);
  });

  it("parses a compose config with frames, word bank, and dictate", () => {
    const compose = schema.parse({
      prompt: "What happened at the volcano?",
      mode: "compose",
      frames: ["The ___ erupted because ___."],
      wordBank: ["lava", "ash", "rumble"],
      allowModes: ["type", "dictate"],
    });
    expect(compose.mode).toBe("compose");
    expect(compose.frames).toHaveLength(1);
    expect(compose.allowModes).toContain("dictate");
  });

  it("still celebrates compose with 3 stars (ideas, never spelling)", () => {
    const compose: JournalPromptConfig = { prompt: "Tell a story.", mode: "compose" };
    const result = score(compose, { text: "the dog ran fast", didDraw: false });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.skillEvidence).toEqual([
      { skill: "writing.sentence", outcome: "solid" },
      { skill: "habits.stamina", outcome: "solid" },
    ]);
  });
});
