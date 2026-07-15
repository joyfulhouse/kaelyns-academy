import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tutor/store", () => ({
  recordOralReadingAttempt: vi.fn(),
}));

import { recordOralReadingAttempt } from "@/lib/tutor/store";
import type { OralReadingConfig } from "@/content/activity-configs";
import {
  canonicalOralReadingResponse,
  getServerAttemptVerifier,
  serverVerifierKinds,
} from "./server-attempt-verifiers";

const wordConfig: OralReadingConfig = {
  presentation: "cold",
  instruction: "Read the word.",
  target: "cat",
  skillTag: "phonics.decode.short-a-cvc",
};

const sentenceConfig: OralReadingConfig = {
  mode: "sentence",
  presentation: "cold",
  instruction: "Read the sentence.",
  passage: "We can see the cat.",
  skillTag: "phonics.decode.short-a-cvc",
};

describe("oral-reading canonical verification response", () => {
  it("canonicalizes no witness to participation only", () => {
    expect(canonicalOralReadingResponse(wordConfig, null)).toEqual({
      attempts: 0,
      results: [],
      status: "participated-unverified",
    });
  });

  it("uses exactly the current word witness and no browser attempt history", () => {
    expect(
      canonicalOralReadingResponse(wordConfig, {
        mode: "word",
        result: "matched",
        perWord: null,
        correctCount: 1,
        totalWords: 1,
        wcpm: null,
      }),
    ).toEqual({ attempts: 1, results: ["matched"], status: "verified" });
  });

  it("rejects a mode or authored sentence-length mismatch", () => {
    expect(
      canonicalOralReadingResponse(wordConfig, {
        mode: "sentence",
        result: "matched",
        perWord: [{ state: "correct" }],
        correctCount: 1,
        totalWords: 1,
        wcpm: 30,
      }),
    ).toBeNull();
    expect(
      canonicalOralReadingResponse(sentenceConfig, {
        mode: "sentence",
        result: "matched",
        perWord: [{ state: "correct" }],
        correctCount: 1,
        totalWords: 1,
        wcpm: 30,
      }),
    ).toBeNull();
  });
});

describe("server attempt verifier registry", () => {
  beforeEach(() => vi.resetAllMocks());

  it("registers only oral-reading and leaves ordinary kinds absent", () => {
    expect(serverVerifierKinds()).toEqual(["oral-reading"]);
    expect(getServerAttemptVerifier("oral-reading")).toBeTypeOf("function");
    expect(getServerAttemptVerifier("math-clock")).toBeUndefined();
  });

  it("scores and records only the canonical witness facts", async () => {
    vi.mocked(recordOralReadingAttempt).mockImplementation(async (_accountId, input) => {
      const canonical = input.canonicalize({
        mode: "word",
        result: "matched",
        perWord: null,
        correctCount: 1,
        totalWords: 1,
        wcpm: null,
      });
      expect(canonical).toMatchObject({
        response: { attempts: 1, results: ["matched"], status: "verified" },
        score: {
          correct: 1,
          total: 1,
          stars: 3,
          skillEvidence: [{ skill: "phonics.decode.short-a-cvc", outcome: "solid" }],
        },
      });
      return canonical?.score ?? null;
    });

    const verifier = getServerAttemptVerifier("oral-reading");
    const score = await verifier?.({
      accountId: "acc-1",
      learnerId: "L1",
      programSlug: "kaelyn-adaptive",
      completionId: "11111111-1111-4111-8111-111111111111",
      unitKey: "unit-1",
      activityId: "oral-1",
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rawConfig: wordConfig,
      allowedSkillTags: ["phonics.decode.short-a-cvc"],
      day: "2026-07-15",
      checkpointPhase: null,
    });

    expect(score).toMatchObject({ stars: 3 });
    expect(recordOralReadingAttempt).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        learnerId: "L1",
        activityId: "oral-1",
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
  });
});
