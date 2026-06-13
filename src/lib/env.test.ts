import { describe, it, expect, beforeEach } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  });

  it("returns a required var", () => {
    expect(getEnv("DATABASE_URL")).toContain("postgres://");
  });

  it("throws a clear error for a missing required var", () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv("DATABASE_URL")).toThrow(/DATABASE_URL/);
  });

  it("returns the fallback for an optional var", () => {
    expect(getEnv("REDIS_URL", "memory")).toBe("memory");
  });
});
