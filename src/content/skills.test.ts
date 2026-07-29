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
  it("registers the seven typing rungs under the typing domain", () => {
    const expectedSlugs = [
      "typing.keys.home-row",
      "typing.keys.top-row",
      "typing.keys.bottom-row",
      "typing.keys.space",
      "typing.keys.shift",
      "typing.words.familiar",
      "typing.fluency.rate",
    ];
    expect(SKILLS.filter((skill) => skill.domain === "typing").map((skill) => skill.slug)).toEqual(
      expectedSlugs,
    );
    for (const slug of expectedSlugs) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("typing");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
      expect(skill!.stretchIndicator?.length, slug).toBeGreaterThan(0);
    }
  });
});
