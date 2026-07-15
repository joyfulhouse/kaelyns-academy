import { describe, expect, it } from "vitest";
import { sightwordGameConfig } from "@/content/activity-configs";
import type { SightwordGameConfig } from "@/content/activity-configs";
import {
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

  it("binds a spoken prompt to its round target by whole word without case sensitivity", () => {
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [
          {
            target: "The",
            choices: ["they", "THE", "then"],
            spokenPrompt: "Find the word THE.",
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [
          {
            target: "he",
            choices: ["he", "she", "we"],
            spokenPrompt: "Find the word she.",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an explicitly named instruction target missing from the rounds", () => {
    expect(
      sightwordGameConfig.safeParse({
        instruction: "Find the word before.",
        rounds: [{ target: "because", choices: ["because", "became"] }],
      }).success,
    ).toBe(false);

    expect(
      sightwordGameConfig.safeParse({
        instruction: "Listen for one word, then find its steady word card.",
        rounds: [{ target: "because", choices: ["because", "became"] }],
      }).success,
    ).toBe(true);
  });

  it("keeps a generic target-word instruction valid", () => {
    expect(
      sightwordGameConfig.safeParse({
        instruction: "Find the target word.",
        rounds: [{ target: "the", choices: ["the", "they"] }],
      }).success,
    ).toBe(true);
  });

  it("rejects a custom spoken prompt that never says its target", () => {
    expect(
      sightwordGameConfig.safeParse({
        ...config,
        rounds: [
          {
            target: "the",
            choices: ["the", "they"],
            spokenPrompt: "Which card can you read?",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects the retired words/decoys compatibility shape", () => {
    expect(
      sightwordGameConfig.safeParse({
        instruction: "Find the words.",
        words: ["the", "and"],
        decoys: ["teh", "nad"],
      }).success,
    ).toBe(false);
  });
});

describe("sight-word response and score", () => {
  it("requires bounded help provenance without accepting child-authored text", () => {
    expect(
      responseSchema.safeParse({
        rounds: [{ roundIndex: 0, choiceIndex: 1, attempts: 1 }],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        rounds: [
          {
            roundIndex: 0,
            choiceIndex: 1,
            attempts: 1,
            usedHelp: false,
            typedWord: "the",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps forgiving stars but emits no mastery evidence when every target was revealed", () => {
    const helped = {
      rounds: [
        { roundIndex: 0, choiceIndex: 1, attempts: 1, usedHelp: true },
        { roundIndex: 1, choiceIndex: 1, attempts: 1, usedHelp: true },
      ],
    } as unknown as SightwordGameResponse;

    expect(score(config, helped)).toMatchObject({
      correct: 2,
      total: 2,
      stars: 2,
      skillEvidence: [],
    });
  });

  it("uses only unhelped observations and caps partially helped evidence below solid", () => {
    const threeRounds: SightwordGameConfig = {
      ...config,
      rounds: [
        { target: "the", choices: ["and", "the", "they"] },
        { target: "you", choices: ["your", "you", "young"] },
        { target: "we", choices: ["way", "were", "we"] },
      ],
    };
    const partiallyHelped = response([
      { roundIndex: 0, choiceIndex: 1, attempts: 1, usedHelp: false },
      { roundIndex: 1, choiceIndex: 1, attempts: 2, usedHelp: true },
      { roundIndex: 2, choiceIndex: 2, attempts: 2, usedHelp: true },
    ]);

    expect(score(threeRounds, partiallyHelped)).toMatchObject({
      correct: 3,
      total: 3,
      stars: 1,
      skillEvidence: [{ skill: "reading.sight-words", outcome: "emerging" }],
    });
  });

  it("awards three stars for every correct target on the first try", () => {
    const result = score(
      config,
      response([
        { roundIndex: 0, choiceIndex: 1, attempts: 1, usedHelp: false },
        { roundIndex: 1, choiceIndex: 1, attempts: 1, usedHelp: false },
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
        { roundIndex: 0, choiceIndex: 1, attempts: 2, usedHelp: false },
        { roundIndex: 1, choiceIndex: 1, attempts: 1, usedHelp: false },
      ]),
    );
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0]?.outcome).toBe("emerging");
    expect(
      responseSchema.safeParse({
        rounds: [{ roundIndex: 0, choiceIndex: 1, attempts: 21, usedHelp: false }],
      }).success,
    ).toBe(false);
  });

  it("rejects missing rounds, duplicate round indexes, and a forged final choice", () => {
    expect(() =>
      score(
        config,
        response([{ roundIndex: 0, choiceIndex: 1, attempts: 1, usedHelp: false }]),
      ),
    ).toThrow("invalid sight-word response");
    expect(
      responseSchema.safeParse({
        rounds: [
          { roundIndex: 0, choiceIndex: 1, attempts: 1, usedHelp: false },
          { roundIndex: 0, choiceIndex: 1, attempts: 1, usedHelp: false },
        ],
      }).success,
    ).toBe(false);
    expect(() =>
      score(
        config,
        response([
          { roundIndex: 0, choiceIndex: 0, attempts: 1, usedHelp: false },
          { roundIndex: 1, choiceIndex: 1, attempts: 1, usedHelp: false },
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
