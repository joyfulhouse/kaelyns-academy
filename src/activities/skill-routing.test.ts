import { describe, expect, it } from "vitest";
import { exactSkillRoutingIssue } from "./skill-routing";

const clockConfig = {
  mode: "set" as const,
  instruction: "Move the hands to three o'clock.",
  targetHour: 3,
  targetMinute: 0 as const,
};

describe("exactSkillRoutingIssue", () => {
  it("accepts the exact known runtime set", () => {
    expect(exactSkillRoutingIssue("math-clock", clockConfig, ["math.time"])).toBeNull();
  });

  it("rejects missing, extra, unknown, or duplicate outer skills", () => {
    expect(exactSkillRoutingIssue("math-clock", clockConfig, [])).toMatch(/missing from outer/);
    expect(
      exactSkillRoutingIssue("math-clock", clockConfig, ["math.time", "math.money"]),
    ).toMatch(/not emitted at runtime/);
    expect(
      exactSkillRoutingIssue("math-clock", clockConfig, ["math.time", "invented.skill"]),
    ).toMatch(/unknown outer skill/);
    expect(
      exactSkillRoutingIssue("math-clock", clockConfig, ["math.time", "math.time"]),
    ).toMatch(/duplicate outer skill/);
  });

  it("accepts an intentionally evidence-free journal and rejects invalid configs", () => {
    expect(
      exactSkillRoutingIssue(
        "journal-prompt",
        { prompt: "Draw one idea." },
        [],
      ),
    ).toBeNull();
    expect(exactSkillRoutingIssue("math-clock", { mode: "set" }, ["math.time"]))
      .toMatch(/invalid or unplayable/);
  });
});
