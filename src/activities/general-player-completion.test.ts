import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PLAYER_PATHS = [
  "./journal-prompt/Player.tsx",
  "./sort-categories/Player.tsx",
  "./seq-order/Player.tsx",
  "./lang-listen-match/Player.tsx",
  "./lang-symbol-intro/Player.tsx",
] as const;

describe("general Player completion contract", () => {
  it.each(PLAYER_PATHS)("%s returns one response directly to its host", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const completionArguments = [...source.matchAll(/\bonComplete\(([^)\n]*)\)/g)].map(
      (match) => match[1],
    );

    expect(source).not.toContain("RewardOverlay");
    expect(source).not.toMatch(/\bscore\b/);
    expect(source).not.toMatch(/\bsetDone\b|\[\s*done\b/);
    expect(completionArguments).toHaveLength(1);
    expect(completionArguments[0]).not.toContain(",");
  });
});
