import { describe, expect, it } from "vitest";
import type { OralReadingConfig } from "@/content/activity-configs";
import {
  responseSchema,
  score,
  skillsAffected,
  validateGenerated,
  type OralReadingResponse,
} from "./logic";

const cfg: OralReadingConfig = {
  presentation: "cold",
  instruction: "Read the word without hearing it first.",
  target: "cat",
  skillTag: "phonics.decode.short-a-cvc",
};

const sentenceCfg: OralReadingConfig = {
  mode: "sentence",
  presentation: "cold",
  instruction: "Read the sentence without hearing it first.",
  passage: "We can see the cat.",
  skillTag: "phonics.decode.short-a-cvc",
};

describe("oral-reading score", () => {
  it("awards 3 stars and solid evidence for a first-try match", () => {
    const response: OralReadingResponse = {
      attempts: 1,
      results: ["matched"],
      status: "verified",
    };

    expect(score(cfg, response)).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "solid" }],
    });
  });

  it("never upgrades a cold first observation with a modeled retry", () => {
    const response: OralReadingResponse = {
      attempts: 2,
      results: ["unclear", "matched"],
      status: "verified",
    };

    expect(score(cfg, response)).toEqual({
      correct: 0,
      total: 1,
      stars: 1,
      skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "not_yet" }],
    });
  });

  it("cannot turn a cold unclear sentence into solid evidence with later metadata", () => {
    expect(
      score(sentenceCfg, {
        attempts: 2,
        results: ["unclear", "matched"],
        status: "verified",
        perWord: Array.from({ length: 5 }, () => ({ state: "correct" as const })),
        correctCount: 5,
        totalWords: 5,
      }),
    ).toEqual({
      correct: 0,
      total: 5,
      stars: 1,
      skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "not_yet" }],
    });
  });

  it("canonicalizes grown-up and service fallback to participation with no evidence", () => {
    const response: OralReadingResponse = {
      attempts: 2,
      results: ["unclear", "no-speech"],
      status: "participated-unverified",
    };

    expect(score(cfg, response)).toEqual({
      correct: 0,
      total: 0,
      stars: 1,
      skillEvidence: [],
    });
  });

  it("still awards 1 star when the child keeps going without verification", () => {
    const response: OralReadingResponse = {
      attempts: 0,
      results: [],
      status: "participated-unverified",
    };

    expect(score(cfg, response).stars).toBe(1);
  });

  it("contains no transcript field in the stored response contract", () => {
    const response: OralReadingResponse = {
      attempts: 1,
      results: ["matched"],
      status: "verified",
    };

    expect(Object.keys(response).sort()).toEqual(["attempts", "results", "status"]);
    expect(
      responseSchema.safeParse({ ...response, transcript: "never persist this" }).success,
    ).toBe(false);
  });

  it("accepts only a bounded opaque verification id on the player response", () => {
    expect(
      responseSchema.safeParse({
        attempts: 1,
        results: ["matched"],
        status: "verified",
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        attempts: 1,
        results: ["matched"],
        status: "verified",
        verificationId: "not-opaque",
      }).success,
    ).toBe(false);
  });

  it("awards 3 stars for strong sentence accuracy", () => {
    const response: OralReadingResponse = {
      attempts: 1,
      results: ["matched"],
      status: "verified",
      wcpm: 42,
      perWord: Array.from({ length: 5 }, () => ({ state: "correct" as const })),
      correctCount: 5,
      totalWords: 5,
    };

    expect(score(sentenceCfg, response)).toEqual({
      correct: 5,
      total: 5,
      stars: 3,
      skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "solid" }],
    });
    expect(Object.keys(response)).not.toContain("transcript");
  });

  it("derives stars and skill evidence from accuracy regardless of WCPM", () => {
    const scoreAt = (correctCount: number, wcpm: number | undefined) =>
      score(sentenceCfg, {
        attempts: 1,
        results: [correctCount === 5 ? "matched" : "unclear"],
        status: "verified",
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
      skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "solid" }],
    });

    expect(scoreAt(4, undefined)).toEqual(scoreAt(4, 1));
    expect(scoreAt(4, 1)).toEqual(scoreAt(4, 300));
    expect(scoreAt(4, 300)).toMatchObject({
      correct: 4,
      total: 5,
      stars: 2,
      skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "emerging" }],
    });
  });

  it("awards participation only when a sentence finishes through fallback", () => {
    expect(
      score(sentenceCfg, {
        attempts: 0,
        results: [],
        status: "participated-unverified",
      }),
    ).toEqual({ correct: 0, total: 0, stars: 1, skillEvidence: [] });
  });
});

describe("oral-reading plugin metadata", () => {
  it("affects exactly the authored skill tag", () => {
    expect(skillsAffected(cfg)).toEqual(["phonics.decode.short-a-cvc"]);
  });

  it("accepts the structurally valid authored config", () => {
    expect(validateGenerated(cfg)).toBeNull();
    expect(validateGenerated(sentenceCfg)).toBeNull();
  });

  it("allows an authored target without skill evidence", () => {
    const config: OralReadingConfig = {
      presentation: "listen-repeat",
      instruction: "Listen, then read the word.",
      target: "the",
    };

    expect(skillsAffected(config)).toEqual([]);
    expect(score(config, { attempts: 1, results: ["matched"], status: "verified" }))
      .toMatchObject({ stars: 3, skillEvidence: [] });
  });

  it("never treats modeled repetition or transcript matching as phrasing evidence", () => {
    const modeled: OralReadingConfig = {
      ...sentenceCfg,
      presentation: "listen-repeat",
    };
    const phrasing: OralReadingConfig = {
      ...sentenceCfg,
      skillTag: "reading.fluency.phrasing",
    };

    expect(skillsAffected(modeled)).toEqual([]);
    expect(skillsAffected(phrasing)).toEqual([]);
    expect(
      score(modeled, {
        attempts: 1,
        results: ["matched"],
        status: "verified",
        correctCount: 5,
        totalWords: 5,
      }).skillEvidence,
    ).toEqual([]);
  });

  it("normalizes legacy stored fallback responses to the explicit status", () => {
    expect(
      responseSchema.parse({ attempts: 0, results: [], fallbackUsed: true }),
    ).toEqual({ attempts: 0, results: [], status: "participated-unverified" });
    expect(
      responseSchema.parse({ attempts: 1, results: ["matched"], fallbackUsed: false }),
    ).toEqual({ attempts: 1, results: ["matched"], status: "verified" });
  });
});
