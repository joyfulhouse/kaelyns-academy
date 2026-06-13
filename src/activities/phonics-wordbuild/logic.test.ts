import { describe, it, expect } from "vitest";
import { score, skillsAffected, type PhonicsWordbuildResponse } from "./logic";
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
      { word: "ship", tries: 1 },
      { word: "chat", tries: 1 },
    ]));
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(2);
    expect(result.skillEvidence).toEqual([{ skill: "phonics.digraphs", outcome: "solid" }]);
  });

  it("awards 2 stars + emerging with one retry", () => {
    const result = score(config, resp([
      { word: "ship", tries: 1 },
      { word: "chat", tries: 3 },
    ]));
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0].outcome).toBe("emerging");
  });

  it("never drops below 1 star when finished, and flags not_yet on heavy help", () => {
    const result = score(config, resp([
      { word: "ship", tries: 4 },
      { word: "chat", tries: 5 },
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
});
