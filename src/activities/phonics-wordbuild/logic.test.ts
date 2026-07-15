import { describe, it, expect } from "vitest";
import {
  responseSchema,
  score,
  skillsAffected,
  validateGenerated,
  type PhonicsWordbuildResponse,
} from "./logic";
import type { PhonicsWordbuildConfig } from "@/content/activity-configs";

const config: PhonicsWordbuildConfig = {
  focus: "sh, ch, th digraphs",
  instruction: "Build the word.",
  tiles: ["sh", "i", "p", "ch", "a", "t"],
  words: [{ word: "ship" }, { word: "chat" }],
};

function resp(builds: PhonicsWordbuildResponse["builds"]): PhonicsWordbuildResponse {
  return { builds };
}

describe("phonics-wordbuild score", () => {
  it("awards 3 stars + solid when every word is built first try", () => {
    const result = score(config, resp([
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1 },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1 },
    ]));
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(2);
    expect(result.skillEvidence).toEqual([{ skill: "phonics.digraphs", outcome: "solid" }]);
  });

  it("awards 2 stars + emerging with one retry", () => {
    const result = score(config, resp([
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1 },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 3 },
    ]));
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0].outcome).toBe("emerging");
  });

  it("never drops below 1 star when finished, and flags not_yet on heavy help", () => {
    const result = score(config, resp([
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 4 },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 5 },
    ]));
    expect(result.stars).toBe(1);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("derives skill tags from the focus", () => {
    expect(skillsAffected({ ...config, focus: "initial blends bl, cr" })).toEqual([
      "phonics.blends.initial",
    ]);
    expect(skillsAffected({ ...config, focus: "short vowels CVC" })).toEqual(["phonics.cvc"]);
  });

  it("emits only build-observable Word Study evidence", () => {
    // The real Program-02 (kaelyn-adaptive) Word Study focus strings.
    expect(
      skillsAffected({
        ...config,
        focus: "the six syllable types (closed, open, silent-e, vowel team, r-controlled, consonant-le)",
      }),
    ).toEqual([]);
    expect(
      skillsAffected({ ...config, focus: "dividing multisyllable words (VC/CV, V/CV, C+le)" }),
    ).toEqual(["word.syllables.division"]);
    expect(
      skillsAffected({ ...config, focus: "prefixes that change meaning (un-, re-, pre-, dis-, mis-, non-)" }),
    ).toEqual([]);
    expect(
      skillsAffected({ ...config, focus: "Greek and Latin roots (tele = far, graph = write)" }),
    ).toEqual([]);
  });

  it("leaves Program-01 phonics focus strings byte-identical", () => {
    // A legacy string that must NOT be captured by the new Word Study checks.
    expect(skillsAffected({ ...config, focus: "digraphs sh / ch / th" })).toEqual([
      "phonics.digraphs",
    ]);
  });

  it("bounds response builds and tile indices", () => {
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 0, tileIndices: [0, 1, 2], attempts: 20 }],
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 0, tileIndices: [0, 0], attempts: 1 }],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 12, tileIndices: [0], attempts: 1 }],
      }).success,
    ).toBe(false);
  });

  it("derives constructed text and rejects reuse, unknown indices, or wrong words", () => {
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [0, 1, 1], attempts: 1 },
        { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1 },
      ])),
    ).toThrow("invalid phonics build");
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [0, 1, 99], attempts: 1 },
        { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1 },
      ])),
    ).toThrow("invalid phonics build");
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [3, 4, 5], attempts: 1 },
        { wordIndex: 1, tileIndices: [0, 1, 2], attempts: 1 },
      ])),
    ).toThrow("invalid phonics build");
  });

  it("requires every target word exactly once", () => {
    expect(() =>
      score(config, resp([{ wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1 }])),
    ).toThrow("invalid phonics build");
  });

  it("validates generated inventory multiplicity and audio metadata", () => {
    expect(validateGenerated(config)).toBeNull();
    expect(validateGenerated({ ...config, tiles: ["sh", "i", "p", "ch", "a"] }))
      .toContain("cannot be built");
    expect(validateGenerated({ ...config, say: { zz: "z" } })).toContain("say key");
  });
});
