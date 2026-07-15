import { describe, expect, it } from "vitest";
import {
  isExactEventPermutation,
  splitPassageSentences,
  validateComprehensionConfig,
} from "./model";

describe("passage evidence model", () => {
  it("splits bounded prose and newline headings into stable sentence indexes", () => {
    expect(splitPassageSentences("HEADING\nFoxes run. They hide!\nLAST PART")).toEqual([
      "HEADING",
      "Foxes run.",
      "They hide!",
      "LAST PART",
    ]);
  });

  it("keeps quoted speech with its lowercase attribution", () => {
    expect(splitPassageSentences('"We are trapped!" said Annie. They found a door.')).toEqual([
      '"We are trapped!" said Annie.',
      "They found a door.",
    ]);
  });

  it("rejects evidence sentence indexes outside the passage", () => {
    expect(
      validateComprehensionConfig({
        passage: "One sentence.",
        questions: [
          {
            prompt: "Which clue?",
            choices: ["One", "Two"],
            answerIndex: 0,
            evidenceSentenceIndexes: [1],
          },
        ],
      }),
    ).toContain("evidence sentence index");
  });
});

describe("structured retell model", () => {
  const eventIds = ["begin", "middle", "end"];

  it("accepts only an exact, unique event permutation", () => {
    expect(isExactEventPermutation(eventIds, ["begin", "middle", "end"])).toBe(true);
    expect(isExactEventPermutation(eventIds, ["begin", "end", "middle"])).toBe(false);
    expect(isExactEventPermutation(eventIds, ["begin", "middle", "middle"])).toBe(false);
    expect(isExactEventPermutation(eventIds, ["begin", "middle"])).toBe(false);
  });

  it("rejects duplicate authored event IDs", () => {
    expect(
      validateComprehensionConfig({
        passage: "A beginning. An ending.",
        questions: [],
        structuredRetell: {
          prompt: "Put the events in order.",
          events: [
            { id: "same", text: "First" },
            { id: "same", text: "Last" },
          ],
        },
      }),
    ).toContain("event IDs");
  });
});
