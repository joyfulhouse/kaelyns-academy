import { describe, expect, it } from "vitest";
import { sightwordGameConfig } from "@/content/activity-configs";
import type { SightwordGameConfig } from "@/content/activity-configs";
import {
  normalizeSightwordRounds,
  responseSchema,
  score,
  skillsAffected,
  validateGenerated,
  type SightwordGameResponse,
} from "./logic";

const config: SightwordGameConfig = {
  instruction: "Listen for each word, then find it.",
  skillTag: "reading.sight-words",
  rounds: [
    { target: "the", choices: ["and", "the", "they"] },
    { target: "you", choices: ["your", "you", "young"], context: "I can see ___." },
  ],
};

function response(rounds: SightwordGameResponse["rounds"]): SightwordGameResponse {
  return { rounds };
}

describe("sight-word round config", () => {
  it("accepts one to eight bounded target rounds", () => {
    expect(sightwordGameConfig.safeParse(config).success).toBe(true);
    expect(sightwordGameConfig.safeParse({ ...config, rounds: [] }).success).toBe(false);
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: Array.from({ length: 9 }, (_, index) => ({
          target: `target-${index}`,
          choices: [`target-${index}`, `decoy-${index}`],
        })),
      }).success,
    ).toBe(false);
  });

  it("requires unique targets and exactly one target among unique choices", () => {
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [
          { target: "the", choices: ["the", "then"] },
          { target: "the", choices: ["the", "they"] },
        ],
      }).success,
    ).toBe(false);
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [{ target: "the", choices: ["the", "the", "they"] }],
      }).success,
    ).toBe(false);
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [{ target: "the", choices: ["then", "they"] }],
      }).success,
    ).toBe(false);
  });

  it("keeps targets disjoint from distractors in other rounds", () => {
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [
          { target: "the", choices: ["the", "you"] },
          { target: "you", choices: ["you", "your"] },
        ],
      }).success,
    ).toBe(false);
  });

  it("normalizes bounded archived configs into static target rounds", () => {
    expect(
      normalizeSightwordRounds({
        instruction: "Find the words.",
        words: ["the", "and"],
        decoys: ["teh", "nad"],
      }),
    ).toEqual([
      { target: "the", choices: ["the", "teh", "nad"] },
      { target: "and", choices: ["and", "teh", "nad"] },
    ]);
    expect(
      sightwordGameConfig.safeParse({ instruction: "Find it.", words: ["the"] }).success,
    ).toBe(false);
  });
});

describe("sight-word response and score", () => {
  it("awards three stars for every correct target on the first try", () => {
    const result = score(
      config,
      response([
        { roundIndex: 0, choiceIndex: 1, attempts: 1 },
        { roundIndex: 1, choiceIndex: 1, attempts: 1 },
      ]),
    );
    expect(result).toMatchObject({ correct: 2, total: 2, stars: 3 });
    expect(result.skillEvidence).toEqual([
      { skill: "reading.sight-words", outcome: "solid" },
    ]);
  });

  it("uses bounded per-round attempts for retry evidence", () => {
    const result = score(
      config,
      response([
        { roundIndex: 0, choiceIndex: 1, attempts: 2 },
        { roundIndex: 1, choiceIndex: 1, attempts: 1 },
      ]),
    );
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0]?.outcome).toBe("emerging");
    expect(
      responseSchema.safeParse({
        rounds: [{ roundIndex: 0, choiceIndex: 1, attempts: 21 }],
      }).success,
    ).toBe(false);
  });

  it("rejects missing rounds, duplicate round indexes, and a forged final choice", () => {
    expect(() =>
      score(config, response([{ roundIndex: 0, choiceIndex: 1, attempts: 1 }])),
    ).toThrow("invalid sight-word response");
    expect(
      responseSchema.safeParse({
        rounds: [
          { roundIndex: 0, choiceIndex: 1, attempts: 1 },
          { roundIndex: 0, choiceIndex: 1, attempts: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(() =>
      score(
        config,
        response([
          { roundIndex: 0, choiceIndex: 0, attempts: 1 },
          { roundIndex: 1, choiceIndex: 1, attempts: 1 },
        ]),
      ),
    ).toThrow("invalid sight-word response");
  });

  it("emits only an explicitly authored recognition skill", () => {
    expect(skillsAffected(config)).toEqual(["reading.sight-words"]);
    expect(skillsAffected({ ...config, skillTag: undefined })).toEqual([]);
  });

  it("exports the same consistency validation for generated rounds", () => {
    expect(validateGenerated(config)).toBeNull();
    expect(
      validateGenerated({
        ...config,
        rounds: [{ target: "the", choices: ["the", "the"] }],
      }),
    ).not.toBeNull();
  });
});
