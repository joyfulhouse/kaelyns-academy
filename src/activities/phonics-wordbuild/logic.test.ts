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
      { wordIndex: 0, tileIndices: [0, 1, 2], attempts: 1 },
      { wordIndex: 1, tileIndices: [3, 4, 5], attempts: 1 },
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
