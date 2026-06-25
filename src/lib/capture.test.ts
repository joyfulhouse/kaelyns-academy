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
    const original = new Error("x");
    expect(() => captureNonCritical("thing failed", original)).not.toThrow();
    // The send failure AND the original event (message + error) are surfaced, so
    // monitoring-down isn't silent and the failed event's context isn't lost.
    expect(consoleError).toHaveBeenCalledWith(
      "captureNonCritical failed:",
      sendError,
      "| original:",
      "thing failed",
      original,
    );
  });
});
