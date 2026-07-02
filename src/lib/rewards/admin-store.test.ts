import { describe, expect, it } from "vitest";
import { validateArtRef } from "./admin-store";

describe("validateArtRef", () => {
  it("accepts the v1 emoji:<1-8 chars> format", () => {
    expect(() => validateArtRef("emoji:🦊")).not.toThrow();
    expect(() => validateArtRef("emoji:🦊🦉")).not.toThrow();
  });

  it("rejects anything not matching emoji:<1-8 chars>", () => {
    expect(() => validateArtRef("emoji:")).toThrow();
    expect(() => validateArtRef("🦊")).toThrow();
    expect(() => validateArtRef("asset:/stickers/fox.png")).toThrow();
    expect(() => validateArtRef("emoji:123456789")).toThrow();
  });
});
