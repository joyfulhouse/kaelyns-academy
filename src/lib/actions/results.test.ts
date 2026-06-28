import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock the capture seam so mapActionError's non-critical logging is observable
// without touching Sentry. The factory must be self-contained (hoisted).
const { captureNonCritical } = vi.hoisted(() => ({ captureNonCritical: vi.fn() }));
vi.mock("@/lib/capture", () => ({ captureNonCritical }));

import { parseInput, mapActionError } from "./results";
import { UnauthenticatedError } from "@/lib/tenancy";

afterEach(() => vi.clearAllMocks());

describe("parseInput", () => {
  it("returns ok + parsed data on a valid input", () => {
    const schema = z.object({ name: z.string() });
    const result = parseInput(schema, { name: "Kaelyn" }, "fallback");
    expect(result).toEqual({ ok: true, data: { name: "Kaelyn" } });
  });

  it("surfaces the first Zod issue's message on an invalid input", () => {
    const schema = z.object({ name: z.string().min(1, "Please enter a name.") });
    const result = parseInput(schema, { name: "" }, "fallback");
    expect(result).toEqual({ ok: false, reason: "invalid", message: "Please enter a name." });
  });

  it("falls back to the provided message when no issue carries a message", () => {
    // Real Zod always attaches a message to a failure's first issue, so the only
    // state that exercises the `issues[0]?.message ?? fallback` tail is an empty
    // issue list — stub a schema that fails that way so the fallback is asserted.
    const schema = {
      safeParse: () => ({ success: false as const, error: { issues: [] } }),
    } as unknown as z.ZodType<{ name: string }>;
    const result = parseInput(schema, { name: "x" }, "Please check the form and try again.");
    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: "Please check the form and try again.",
    });
  });
});

describe("mapActionError", () => {
  it("maps an UnauthenticatedError to a calm sign-in prompt without logging", () => {
    const result = mapActionError(new UnauthenticatedError(), "ctx", "Unavailable, try again.");
    expect(result).toEqual({
      ok: false,
      reason: "unauthenticated",
      message: "Please sign in again.",
    });
    expect(captureNonCritical).not.toHaveBeenCalled();
  });

  it("logs any other error non-critically and reports the passed unavailable message", () => {
    const error = new Error("boom");
    const result = mapActionError(error, "thing failed", "Could not do the thing. Please try again.");
    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      message: "Could not do the thing. Please try again.",
    });
    expect(captureNonCritical).toHaveBeenCalledWith("thing failed", error);
  });
});
