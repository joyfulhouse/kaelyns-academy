import { describe, expect, it } from "vitest";
import { firstConfigIssueMessage, validateActivityConfig } from "./validate";

describe("validateActivityConfig", () => {
  it("returns the PARSED config (zod defaults applied) on success", () => {
    // sightword-game's `decoys` defaults to [] — proving we return parsed output,
    // not the raw input (assembleProgram relies on this).
    const result = validateActivityConfig("sightword-game", {
      instruction: "Tap the word",
      words: ["the", "and"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as { decoys: string[] }).decoys).toEqual([]);
  });

  it("flags an unknown kind without throwing", () => {
    const result = validateActivityConfig("not-a-real-kind", {});
    expect(result).toEqual({ ok: false, reason: "unknown-kind" });
  });

  it("flags a schema-invalid config and carries the ZodError", () => {
    // tiles needs >= 2 entries.
    const result = validateActivityConfig("phonics-wordbuild", {
      focus: "s",
      instruction: "Build",
      tiles: ["s"],
      words: [{ word: "s" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("firstConfigIssueMessage", () => {
  function issueError() {
    const result = validateActivityConfig("phonics-wordbuild", {
      focus: "s",
      instruction: "Build",
      tiles: ["s"],
      words: [{ word: "s" }],
    });
    if (result.ok || result.reason !== "invalid") throw new Error("expected an invalid result");
    return result.error;
  }

  it("prefixes the dotted path only when withPath is set", () => {
    const err = issueError();
    const bare = firstConfigIssueMessage(err, { fallback: "invalid config" });
    const withPath = firstConfigIssueMessage(err, { withPath: true, fallback: "Invalid config" });
    expect(bare.length).toBeGreaterThan(0);
    expect(withPath).toMatch(/^tiles: /); // the failing path is `tiles`
    expect(withPath).toBe(`tiles: ${bare}`); // path form == "path: " + bare message
  });

  it("uses the fallback only when the issue has no message", () => {
    const fakeError = { issues: [{ path: [], message: undefined }] } as never;
    expect(firstConfigIssueMessage(fakeError, { fallback: "FALLBACK" })).toBe("FALLBACK");
  });
});
