import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: (cb: (s: { setLevel: () => void }) => void) => cb({ setLevel: vi.fn() }),
}));
import { captureNonCritical } from "./capture";
import * as Sentry from "@sentry/nextjs";

describe("captureNonCritical", () => {
  afterEach(() => vi.restoreAllMocks());

  it("captures with a warning level and never throws", () => {
    expect(() => captureNonCritical("thing failed", new Error("x"))).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("falls back to stderr (still non-throwing) when the Sentry send itself fails", () => {
    // Monitoring-down must not be silent: a failed send is surfaced on stderr.
    const sendError = new Error("sentry transport down");
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
      throw sendError;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => captureNonCritical("thing failed", new Error("x"))).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("captureNonCritical failed:", sendError);
  });
});
