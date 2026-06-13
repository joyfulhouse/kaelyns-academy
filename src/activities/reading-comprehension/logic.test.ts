import { describe, it, expect } from "vitest";
import { schema, score, skillsAffected } from "./logic";
import type { ReadingComprehensionConfig } from "@/content/activity-configs";

const config: ReadingComprehensionConfig = {
  instruction: "Read about the fox, then answer.",
  title: "The Quick Fox",
  passage: "A red fox ran across the field. It was looking for food for its babies.",
  questions: [
    {
      prompt: "What color was the fox?",
      choices: ["Red", "Blue", "Green"],
      answerIndex: 0,
      kind: "literal",
    },
    {
      prompt: "Why was the fox looking for food?",
      choices: ["To play", "For its babies", "To hide"],
      answerIndex: 1,
      kind: "inference",
    },
  ],
  retellPrompt: "Tell the story in your own words.",
};

describe("reading-comprehension schema", () => {
  it("defaults a question kind to literal", () => {
    const parsed = schema.parse({
      instruction: "Read it.",
      passage: "The cat sat.",
      questions: [{ prompt: "Who sat?", choices: ["Cat", "Dog"], answerIndex: 0 }],
    });
    expect(parsed.questions[0].kind).toBe("literal");
  });
});

describe("reading-comprehension skillsAffected", () => {
  it("maps question kinds to distinct reading skill tags, in order", () => {
    expect(skillsAffected(config)).toEqual(["reading.comprehension.retell", "reading.comprehension.inference"]);
  });

  it("de-duplicates repeated kinds", () => {
    const twoLiteral: ReadingComprehensionConfig = {
      ...config,
      questions: [config.questions[0], { ...config.questions[0], prompt: "Again?" }],
    };
    expect(skillsAffected(twoLiteral)).toEqual(["reading.comprehension.retell"]);
  });
});

describe("reading-comprehension score", () => {
  it("3 stars + solid when every question is first try", () => {
    const result = score(config, { firstTry: [true, true], retold: true });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "reading.comprehension.retell", outcome: "solid" },
      { skill: "reading.comprehension.inference", outcome: "solid" },
    ]);
  });

  it("2 stars + per-kind evidence when half are first try", () => {
    const result = score(config, { firstTry: [true, false], retold: false });
    expect(result.stars).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.skillEvidence).toEqual([
      { skill: "reading.comprehension.retell", outcome: "solid" },
      { skill: "reading.comprehension.inference", outcome: "not_yet" },
    ]);
  });

  it("never drops below 1 star even with no first-try successes (forgiving)", () => {
    const result = score(config, { firstTry: [false, false], retold: false });
    expect(result.stars).toBe(1);
    expect(result.correct).toBe(0);
  });
});
