import { describe, expect, it } from "vitest";
import type { OralReadingConfig } from "@/content/activity-configs";
import { score, skillsAffected, validateGenerated, type OralReadingResponse } from "./logic";

const cfg: OralReadingConfig = {
  instruction: "Listen, then read the word.",
  target: "there",
  skillTag: "word.syllables.types",
};

const sentenceCfg: OralReadingConfig = {
  mode: "sentence",
  instruction: "Listen, then read the sentence.",
  passage: "We can see the cat.",
  skillTag: "reading.fluency.phrasing",
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

  it("awards 3 stars for strong sentence accuracy", () => {
    const response: OralReadingResponse = {
      attempts: 1,
      results: ["matched"],
      fallbackUsed: false,
      wcpm: 42,
      perWord: Array.from({ length: 5 }, () => ({ state: "correct" as const })),
      correctCount: 5,
      totalWords: 5,
    };

    expect(score(sentenceCfg, response)).toEqual({
      correct: 5,
      total: 5,
      stars: 3,
      skillEvidence: [{ skill: "reading.fluency.phrasing", outcome: "solid" }],
    });
    expect(Object.keys(response)).not.toContain("transcript");
  });

  it("derives stars and skill evidence from accuracy regardless of WCPM", () => {
    const scoreAt = (correctCount: number, wcpm: number | undefined) =>
      score(sentenceCfg, {
        attempts: 1,
        results: [correctCount === 5 ? "matched" : "unclear"],
        fallbackUsed: false,
        wcpm,
        correctCount,
        totalWords: 5,
      });

    expect(scoreAt(5, undefined)).toEqual(scoreAt(5, 1));
    expect(scoreAt(5, 1)).toEqual(scoreAt(5, 300));
    expect(scoreAt(5, 1)).toMatchObject({
      correct: 5,
      total: 5,
      stars: 3,
      skillEvidence: [{ skill: "reading.fluency.phrasing", outcome: "solid" }],
    });

    expect(scoreAt(4, undefined)).toEqual(scoreAt(4, 1));
    expect(scoreAt(4, 1)).toEqual(scoreAt(4, 300));
    expect(scoreAt(4, 300)).toMatchObject({
      correct: 4,
      total: 5,
      stars: 2,
      skillEvidence: [{ skill: "reading.fluency.phrasing", outcome: "emerging" }],
    });
  });

  it("always awards at least 1 star when a sentence finishes through fallback", () => {
    expect(
      score(sentenceCfg, { attempts: 0, results: [], fallbackUsed: true }),
    ).toMatchObject({ correct: 0, total: 5, stars: 1 });
  });
});

describe("oral-reading plugin metadata", () => {
  it("affects exactly the authored skill tag", () => {
    expect(skillsAffected(cfg)).toEqual(["word.syllables.types"]);
  });

  it("accepts the structurally valid authored config", () => {
    expect(validateGenerated(cfg)).toBeNull();
    expect(validateGenerated(sentenceCfg)).toBeNull();
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
