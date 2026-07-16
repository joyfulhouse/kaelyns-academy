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
  skillTag: "phonics.decode.digraph-sh",
  tiles: ["sh", "i", "p", "ch", "a", "t"],
  words: [{ word: "ship" }, { word: "chat" }],
};

function resp(builds: PhonicsWordbuildResponse["builds"]): PhonicsWordbuildResponse {
  return { builds };
}

describe("phonics-wordbuild score", () => {
  it("awards 3 stars + solid when every word is built first try", () => {
    const result = score(config, resp([
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1, usedHelp: false },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1, usedHelp: false },
    ]));
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "phonics.decode.digraph-sh", outcome: "solid" },
    ]);
  });

  it("awards 2 stars + emerging with one retry", () => {
    const result = score(config, resp([
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1, usedHelp: false },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 3, usedHelp: false },
    ]));
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0].outcome).toBe("emerging");
  });

  it("never drops below 1 star when finished, and flags not_yet on heavy help", () => {
    const result = score(config, resp([
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 4, usedHelp: false },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 5, usedHelp: false },
    ]));
    expect(result.stars).toBe(1);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("routes only the explicit current skill tag, never descriptive focus text", () => {
    expect(skillsAffected({ ...config, focus: "unrelated descriptive copy" })).toEqual([
      "phonics.decode.digraph-sh",
    ]);
    expect(
      skillsAffected({
        focus: "digraphs sh / ch / th",
        instruction: config.instruction,
        tiles: config.tiles,
        words: config.words,
      }),
    ).toEqual([]);
  });

  it("bounds response builds and tile indices", () => {
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 0, tileIndices: [0, 1, 2], attempts: 20, usedHelp: false }],
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 0, tileIndices: [0, 0], attempts: 1, usedHelp: false }],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 12, tileIndices: [0], attempts: 1, usedHelp: false }],
      }).success,
    ).toBe(false);
  });

  it("requires bounded per-word help provenance in the strict response", () => {
    expect(
      responseSchema.safeParse({
        builds: [
          {
            wordIndex: 0,
            tileIndices: [0, 1, 2],
            attempts: 1,
            usedHelp: false,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        builds: [{ wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1 }],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        builds: [
          {
            wordIndex: 0,
            tileIndices: [0, 1, 2],
            attempts: 1,
            usedHelp: false,
            targetText: "ship",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps completion stars but emits no mastery evidence when every word was revealed", () => {
    const result = score(config, {
      builds: [
        { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1, usedHelp: true },
        { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1, usedHelp: true },
      ],
    });

    expect(result).toMatchObject({
      correct: 2,
      total: 2,
      stars: 3,
      skillEvidence: [],
    });
  });

  it("uses only unassisted observations and caps partially assisted evidence at emerging", () => {
    const result = score(config, {
      builds: [
        { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1, usedHelp: false },
        { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1, usedHelp: true },
      ],
    });

    expect(result).toMatchObject({
      correct: 2,
      total: 2,
      stars: 3,
      skillEvidence: [{ skill: "phonics.decode.digraph-sh", outcome: "emerging" }],
    });
  });

  it("derives constructed text and rejects reuse, unknown indices, or wrong words", () => {
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [0, 1, 1], attempts: 1, usedHelp: false },
        { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1, usedHelp: false },
      ])),
    ).toThrow("invalid phonics build");
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [0, 1, 99], attempts: 1, usedHelp: false },
        { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1, usedHelp: false },
      ])),
    ).toThrow("invalid phonics build");
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [3, 4, 5], attempts: 1, usedHelp: false },
        { wordIndex: 1, tileIndices: [0, 1, 2], attempts: 1, usedHelp: false },
      ])),
    ).toThrow("invalid phonics build");
  });

  it("requires every target word exactly once", () => {
    expect(() =>
      score(config, resp([
        { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1, usedHelp: false },
      ])),
    ).toThrow("invalid phonics build");
  });

  it("validates generated inventory multiplicity and audio metadata", () => {
    expect(validateGenerated(config)).toBeNull();
    expect(validateGenerated({ ...config, tiles: ["sh", "i", "p", "ch", "a"] }))
      .toContain("cannot be built");
    expect(validateGenerated({ ...config, say: { zz: "z" } })).toContain("say key");
  });
});
