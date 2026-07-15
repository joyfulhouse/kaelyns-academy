import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PLAYER_PATHS = [
  "./math-clock/Player.tsx",
  "./math-money/Player.tsx",
  "./math-measure/Player.tsx",
  "./math-array/Player.tsx",
  "./math-tenframe/Player.tsx",
] as const;

describe("math Player completion contract", () => {
  it.each(PLAYER_PATHS)("%s returns one response directly to its host", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const completionArguments = [...source.matchAll(/\bonComplete\(([^)\n]*)\)/g)].map(
      (match) => match[1],
    );

    expect(source).not.toContain("RewardOverlay");
    expect(source).not.toMatch(/\bscore\b/);
    expect(source).not.toMatch(/\b(?:done|setDone)\b/);
    expect(completionArguments.length).toBeGreaterThan(0);
    expect(completionArguments.every((argument) => !argument.includes(","))).toBe(true);
  });
});
