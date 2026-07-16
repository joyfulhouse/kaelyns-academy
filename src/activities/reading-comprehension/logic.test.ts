import { describe, expect, it } from "vitest";
import type { ReadingComprehensionConfig } from "@/content/activity-configs";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type ReadingComprehensionResponse,
} from "./logic";

const config: ReadingComprehensionConfig = {
  instruction: "Read about the fox, then answer.",
  title: "The Quick Fox",
  passage: "A red fox ran across the field. It was looking for food for its babies.",
  questions: [
    {
      prompt: "Why was the fox looking for food?",
      choices: ["To play", "For its babies", "To hide"],
      answerIndex: 1,
      kind: "inference",
      skillTag: "reading.comprehension.inference",
      evidenceSentenceIndexes: [1],
    },
    {
      prompt: "What is this mostly about?",
      choices: ["A fox finding food", "A blue bird", "A rainy day"],
      answerIndex: 0,
      kind: "main-idea",
      skillTag: "reading.comprehension.main-idea",
      evidenceChoices: {
        prompt: "Which detail supports that idea?",
        choices: ["The fox ran and looked for food", "The field was blue"],
        answerIndex: 0,
      },
    },
  ],
  structuredRetell: {
    prompt: "Put the events in story order.",
    events: [
      { id: "run", text: "The fox ran across the field." },
      { id: "look", text: "The fox looked for food." },
    ],
  },
};

function completed(overrides: Partial<ReadingComprehensionResponse> = {}): ReadingComprehensionResponse {
  return {
    questionResults: [
      { questionIndex: 0, choiceIndex: 1, evidenceSentenceIndex: 1, attempts: 1 },
      { questionIndex: 1, choiceIndex: 0, evidenceChoiceIndex: 0, attempts: 1 },
    ],
    retell: { eventIds: ["run", "look"], attempts: 1 },
    ...overrides,
  };
}

describe("reading-comprehension schema", () => {
  it("bounds answers, choices, evidence, and retell events", () => {
    expect(schema.safeParse(config).success).toBe(true);
    expect(
      schema.safeParse({
        ...config,
        questions: [{ ...config.questions[0], answerIndex: 3 }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...config,
        questions: [{ ...config.questions[0], choices: ["same", "same"] }],
      }).success,
    ).toBe(false);
  });

  it("does not allow ordinary questions to claim retell or fluency", () => {
    for (const skillTag of ["reading.comprehension.retell", "reading.fluency.phrasing"]) {
      expect(
        schema.safeParse({
          ...config,
          structuredRetell: undefined,
          questions: [{ ...config.questions[0], skillTag }],
        }).success,
      ).toBe(false);
    }
  });
});

describe("reading-comprehension scoring", () => {
  it("scores directly observed answer, evidence, and event order", () => {
    const result = score(config, completed());
    expect(result).toMatchObject({ correct: 3, total: 3, stars: 3 });
    expect(result.skillEvidence).toEqual([
      { skill: "reading.comprehension.inference", outcome: "solid" },
      { skill: "reading.comprehension.main-idea", outcome: "solid" },
      { skill: "reading.comprehension.retell", outcome: "solid" },
    ]);
  });

  it("uses bounded attempts per observed task", () => {
    const result = score(
      config,
      completed({
        questionResults: [
          { questionIndex: 0, choiceIndex: 1, evidenceSentenceIndex: 1, attempts: 2 },
          { questionIndex: 1, choiceIndex: 0, evidenceChoiceIndex: 0, attempts: 1 },
        ],
      }),
    );
    expect(result.correct).toBe(2);
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0]?.outcome).toBe("not_yet");
  });

  it("rejects forged answers, missing evidence, and a wrong retell order", () => {
    expect(() =>
      score(config, completed({
        questionResults: [
          { questionIndex: 0, choiceIndex: 0, evidenceSentenceIndex: 1, attempts: 1 },
          { questionIndex: 1, choiceIndex: 0, evidenceChoiceIndex: 0, attempts: 1 },
        ],
      })),
    ).toThrow("invalid comprehension response");
    expect(() =>
      score(config, completed({
        questionResults: [
          { questionIndex: 0, choiceIndex: 1, attempts: 1 },
          { questionIndex: 1, choiceIndex: 0, evidenceChoiceIndex: 0, attempts: 1 },
        ],
      })),
    ).toThrow("invalid comprehension response");
    expect(() =>
      score(config, completed({ retell: { eventIds: ["look", "run"], attempts: 1 } })),
    ).toThrow("invalid comprehension response");
  });

  it("does not turn an unrecorded retell prompt or literal choice into retell evidence", () => {
    const literal: ReadingComprehensionConfig = {
      instruction: "Read and answer.",
      passage: "The cat sat.",
      questions: [
        { prompt: "Who sat?", choices: ["Cat", "Dog"], answerIndex: 0, kind: "literal" },
      ],
      retellPrompt: "Tell someone what happened.",
    };
    expect(skillsAffected(literal)).toEqual([]);
    expect(
      score(literal, {
        questionResults: [{ questionIndex: 0, choiceIndex: 0, attempts: 1 }],
      }).skillEvidence,
    ).toEqual([]);
  });

  it("caps response arrays and exports generated consistency validation", () => {
    expect(
      responseSchema.safeParse({
        questionResults: [{ questionIndex: 0, choiceIndex: 0, attempts: 21 }],
      }).success,
    ).toBe(false);
    expect(validateGenerated(config)).toBeNull();
    expect(
      validateGenerated({
        ...config,
        questions: [{ ...config.questions[0], evidenceSentenceIndexes: [20] }],
      }),
    ).not.toBeNull();
  });
});
