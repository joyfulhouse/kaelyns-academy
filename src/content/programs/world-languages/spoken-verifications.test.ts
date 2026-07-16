import { describe, expect, it } from "vitest";
import { spokenVerifications } from "./spoken-verifications";

describe("spokenVerifications", () => {
  it("uses the visible prompt by default and preserves an authored spoken prompt", () => {
    expect(
      spokenVerifications([
        { prompt: "Which one?", choices: ["a", "b"], answerIndex: 0 },
        {
          prompt: "Visible wording",
          spokenPrompt: "Spoken wording",
          choices: ["a", "b"],
          answerIndex: 1,
        },
      ]),
    ).toEqual([
      {
        prompt: "Which one?",
        spokenPrompt: "Which one?",
        choices: ["a", "b"],
        answerIndex: 0,
      },
      {
        prompt: "Visible wording",
        spokenPrompt: "Spoken wording",
        choices: ["a", "b"],
        answerIndex: 1,
      },
    ]);
  });
});
