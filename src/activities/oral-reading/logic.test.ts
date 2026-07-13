import { describe, expect, it } from "vitest";
import type { OralReadingConfig } from "@/content/activity-configs";
import { score, skillsAffected, validateGenerated, type OralReadingResponse } from "./logic";

const cfg: OralReadingConfig = {
  instruction: "Listen, then read the word.",
  target: "there",
  skillTag: "word.syllables.types",
};

describe("oral-reading score", () => {
  it("awards 3 stars and solid evidence for a first-try match", () => {
    const response: OralReadingResponse = {
      attempts: 1,
      results: ["matched"],
      fallbackUsed: false,
    };

    expect(score(cfg, response)).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "word.syllables.types", outcome: "solid" }],
    });
  });

  it("awards 2 stars and emerging evidence for a second-try match", () => {
    const response: OralReadingResponse = {
      attempts: 2,
      results: ["unclear", "matched"],
      fallbackUsed: false,
    };

    expect(score(cfg, response)).toEqual({
      correct: 1,
      total: 1,
      stars: 2,
      skillEvidence: [{ skill: "word.syllables.types", outcome: "emerging" }],
    });
  });

  it("keeps the grown-up fallback forgiving at 1 star", () => {
    const response: OralReadingResponse = {
      attempts: 2,
      results: ["unclear", "no-speech"],
      fallbackUsed: true,
    };

    expect(score(cfg, response)).toEqual({
      correct: 0,
      total: 1,
      stars: 1,
      skillEvidence: [{ skill: "word.syllables.types", outcome: "not_yet" }],
    });
  });

  it("still awards 1 star when the child keeps going without verification", () => {
    const response: OralReadingResponse = {
      attempts: 0,
      results: [],
      fallbackUsed: true,
    };

    expect(score(cfg, response).stars).toBe(1);
  });

  it("contains no transcript field in the stored response contract", () => {
    const response: OralReadingResponse = {
      attempts: 1,
      results: ["matched"],
      fallbackUsed: false,
    };

    expect(Object.keys(response).sort()).toEqual(["attempts", "fallbackUsed", "results"]);
  });
});

describe("oral-reading plugin metadata", () => {
  it("affects exactly the authored skill tag", () => {
    expect(skillsAffected(cfg)).toEqual(["word.syllables.types"]);
  });

  it("accepts the structurally valid authored config", () => {
    expect(validateGenerated(cfg)).toBeNull();
  });

  it("allows an authored target without skill evidence", () => {
    const config: OralReadingConfig = {
      instruction: "Listen, then read the word.",
      target: "the",
    };

    expect(skillsAffected(config)).toEqual([]);
    expect(score(config, { attempts: 1, results: ["matched"], fallbackUsed: false }))
      .toMatchObject({ stars: 3, skillEvidence: [] });
  });
});
