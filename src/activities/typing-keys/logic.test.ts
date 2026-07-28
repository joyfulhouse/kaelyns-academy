import { describe, expect, it } from "vitest";
import type { TypingKeysConfig } from "@/content/activity-configs";
import { expectedPrompts, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingKeysConfig = {
  instruction: "Press the glowing key.",
  keys: ["f", "j"],
  reps: 2,
};

function prompts(spec: { key: string; ok?: boolean; retries?: number }[]) {
  return { prompts: spec.map((s) => ({ key: s.key, ok: s.ok ?? true, retries: s.retries ?? 0 })) };
}

describe("expectedPrompts", () => {
  it("cycles the keys once per rep, so Player and scoring agree on the order", () => {
    expect(expectedPrompts(CONFIG)).toEqual(["f", "j", "f", "j"]);
  });

  it("defaults reps so an author can omit it", () => {
    expect(expectedPrompts({ instruction: "Go.", keys: ["a"] })).toEqual(["a", "a"]);
  });
});

describe("score", () => {
  it("awards three stars when every key landed first try", () => {
    const result = score(CONFIG, prompts([{ key: "f" }, { key: "j" }, { key: "f" }, { key: "j" }]));
    expect(result).toEqual({
      correct: 4,
      total: 4,
      stars: 3,
      skillEvidence: [{ skill: "typing.keys.home-row", outcome: "solid" }],
    });
  });

  it("drops to emerging when half needed a retry", () => {
    const result = score(
      CONFIG,
      prompts([
        { key: "f" },
        { key: "j", retries: 2 },
        { key: "f" },
        { key: "j", retries: 1 },
      ]),
    );
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "emerging" },
    ]);
  });

  it("yields no evidence when the prompt order does not match the config", () => {
    const result = score(CONFIG, prompts([{ key: "j" }, { key: "f" }, { key: "f" }, { key: "j" }]));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence when the prompt count does not match the config", () => {
    const result = score(CONFIG, prompts([{ key: "f" }]));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence when a prompt was never satisfied", () => {
    const result = score(
      CONFIG,
      prompts([{ key: "f" }, { key: "j" }, { key: "f" }, { key: "j", ok: false }]),
    );
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });
});

describe("skillsAffected", () => {
  it("derives one skill per row touched, sorted", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.keys.home-row"]);
    expect(skillsAffected({ ...CONFIG, keys: ["f", "q"] })).toEqual([
      "typing.keys.home-row",
      "typing.keys.top-row",
    ]);
  });

  it("counts a capital as shift work", () => {
    expect(skillsAffected({ ...CONFIG, keys: ["F"] })).toEqual(["typing.keys.shift-space"]);
  });
});

describe("validateGenerated", () => {
  it("accepts teachable keys", () => {
    expect(validateGenerated(CONFIG)).toBeNull();
  });

  it("rejects a key that is not on the board", () => {
    expect(validateGenerated({ ...CONFIG, keys: ["4"] })).toBe("untaught key: 4");
  });

  it("rejects a duplicated key", () => {
    expect(validateGenerated({ ...CONFIG, keys: ["f", "f"] })).toBe("duplicate key: f");
  });
});
