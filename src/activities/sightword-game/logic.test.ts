import { describe, it, expect } from "vitest";
import { score, skillsAffected } from "./logic";
import type { SightwordGameConfig } from "@/content/activity-configs";

const config: SightwordGameConfig = {
  instruction: "Tap the words you can read.",
  words: ["the", "and", "you"],
  decoys: ["teh", "nad"],
};

describe("sightword-game score", () => {
  it("awards 3 stars when all targets found with no decoy taps", () => {
    const result = score(config, { found: ["the", "and", "you"], decoyTaps: 0 });
    expect(result.stars).toBe(3);
    expect(result.correct).toBe(3);
    expect(result.total).toBe(3);
    expect(result.skillEvidence).toEqual([{ skill: "reading.decodable", outcome: "solid" }]);
  });

  it("dilutes to 2 stars / emerging with a couple decoy taps", () => {
    const result = score(config, { found: ["the", "and", "you"], decoyTaps: 1 });
    expect(result.stars).toBe(2);
    expect(result.skillEvidence[0].outcome).toBe("emerging");
  });

  it("stays at 1 star (never zero when finished) on many decoy taps", () => {
    const result = score(config, { found: ["the", "and", "you"], decoyTaps: 6 });
    expect(result.stars).toBe(1);
    expect(result.skillEvidence[0].outcome).toBe("not_yet");
  });

  it("reports the single decodable reading skill", () => {
    expect(skillsAffected(config)).toEqual(["reading.decodable"]);
  });
});
