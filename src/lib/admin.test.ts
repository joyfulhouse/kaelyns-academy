import { describe, it, expect } from "vitest";
import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("returns true for an exact match", () => {
    expect(isAdminEmail("admin@example.com", "admin@example.com")).toBe(true);
  });

  it("is case-insensitive on the email argument", () => {
    expect(isAdminEmail("ADMIN@Example.COM", "admin@example.com")).toBe(true);
  });

  it("is case-insensitive on allowlist entries", () => {
    expect(isAdminEmail("admin@example.com", "ADMIN@EXAMPLE.COM")).toBe(true);
  });

  it("trims whitespace from allowlist entries", () => {
    expect(isAdminEmail("admin@example.com", "  admin@example.com  ")).toBe(true);
  });

  it("matches within a comma-separated list", () => {
    expect(
      isAdminEmail("editor@example.com", "admin@example.com,editor@example.com,owner@example.com"),
    ).toBe(true);
  });

  it("matches with spaces around commas", () => {
    expect(
      isAdminEmail("editor@example.com", "admin@example.com , editor@example.com"),
    ).toBe(true);
  });

  it("returns false for no match", () => {
    expect(isAdminEmail("other@example.com", "admin@example.com,editor@example.com")).toBe(false);
  });

  it("returns false for empty allowlist", () => {
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
  });

  it("returns false for null email", () => {
    expect(isAdminEmail(null, "admin@example.com")).toBe(false);
  });

  it("returns false for undefined email", () => {
    expect(isAdminEmail(undefined, "admin@example.com")).toBe(false);
  });

  it("returns false for empty email string", () => {
    expect(isAdminEmail("", "admin@example.com")).toBe(false);
  });

  it("handles allowlist with only whitespace entries after split", () => {
    expect(isAdminEmail("admin@example.com", "  ,  ")).toBe(false);
  });
});
