import { describe, expect, it } from "vitest";
import { SKILLS } from "./skills";

describe("Life Skills Math skills", () => {
  it("registers time/money/measure under the lifeskills domain", () => {
    for (const slug of ["math.time", "math.money", "math.measure"]) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("lifeskills");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
    }
  });
});

describe("Science & Nature skills", () => {
  it("registers classify + sequence under the science domain", () => {
    for (const slug of ["science.classify", "science.sequence"]) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("science");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
    }
  });
});

describe("Keyboard Club skills", () => {
  it("registers the six typing rungs under the typing domain", () => {
    for (const slug of [
      "typing.keys.home-row",
      "typing.keys.top-row",
      "typing.keys.bottom-row",
      "typing.keys.shift-space",
      "typing.words.familiar",
      "typing.fluency.rate",
    ]) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("typing");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
    }
  });
});
