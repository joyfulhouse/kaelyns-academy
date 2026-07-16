import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PLAYER_PATHS = ["./math-array/Player.tsx", "./math-tenframe/Player.tsx"] as const;

describe("math retry feedback contract", () => {
  it.each(PLAYER_PATHS)("%s keeps wrong-check coaching in a persistent live surface", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");

    expect(source).toContain("RetryFeedback");
    expect(source).toContain("setCorrection");
  });
});
