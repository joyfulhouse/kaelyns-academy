import { describe, it, expect } from "vitest";
import { isAdminEmail, adminVerdict } from "./admin";

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

describe("adminVerdict (P4 role gate)", () => {
  it("returns 'unauthenticated' when there is no session", () => {
    expect(adminVerdict(false, null)).toBe("unauthenticated");
    // Even if a row were somehow present, no session wins.
    expect(adminVerdict(false, { role: "admin" })).toBe("unauthenticated");
  });

  it("returns 'unauthenticated' for a session whose user row is gone (stale)", () => {
    expect(adminVerdict(true, null)).toBe("unauthenticated");
    expect(adminVerdict(true, undefined)).toBe("unauthenticated");
  });

  it("returns 'forbidden' for an authenticated non-admin", () => {
    // THE core regression: a self-registered (even allowlisted) email defaults to
    // role 'user' and must be rejected — the allowlist is not the authority anymore.
    expect(adminVerdict(true, { role: "user" })).toBe("forbidden");
  });

  it("returns 'forbidden' for any non-'admin' role value", () => {
    expect(adminVerdict(true, { role: "parent" })).toBe("forbidden");
    expect(adminVerdict(true, { role: "" })).toBe("forbidden");
    expect(adminVerdict(true, { role: "ADMIN" })).toBe("forbidden"); // exact match only
  });

  it("returns 'ok' only for an authenticated user whose row is role 'admin'", () => {
    expect(adminVerdict(true, { role: "admin" })).toBe("ok");
  });
});
