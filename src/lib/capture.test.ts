import { describe, it, expect, vi } from "vitest";
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: (cb: (s: { setLevel: () => void }) => void) => cb({ setLevel: vi.fn() }),
}));
import { captureNonCritical } from "./capture";
import * as Sentry from "@sentry/nextjs";

describe("captureNonCritical", () => {
  it("captures with a warning level and never throws", () => {
    expect(() => captureNonCritical("thing failed", new Error("x"))).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
